-- =====================================================================
-- Update 002 — edit an existing order (change quantities, remove items,
-- add extra items, change payment method).
-- Run once in Supabase -> SQL Editor. Safe to run again.
-- (Fresh installs already get this from database/schema.sql.)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.edit_sale(_invoice_id UUID, payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_cust RECORD;
  v_item JSONB;
  v_pay JSONB;
  v_paid NUMERIC := 0;
  v_total NUMERIC := COALESCE((payload->'totals'->>'grandTotal')::NUMERIC, 0);
  v_old_credit NUMERIC := 0;
  v_new_credit NUMERIC := 0;
  v_rid UUID := public.current_restaurant_id();
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Only a manager or admin can edit an order';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = _invoice_id AND restaurant_id = v_rid FOR UPDATE;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_inv.status <> 'completed' THEN RAISE EXCEPTION 'Only completed orders can be edited'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = _invoice_id AND returned_qty > 0) THEN
    RAISE EXCEPTION 'This order has returned items, so it cannot be edited';
  END IF;
  IF jsonb_array_length(COALESCE(payload->'items','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'An order needs at least one item. Cancel the order instead.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products WHERE id = (v_item->>'productId')::UUID AND restaurant_id = v_rid
    ) THEN RAISE EXCEPTION 'Menu item not found'; END IF;
    IF COALESCE((v_item->>'quantity')::NUMERIC, 0) <= 0 THEN RAISE EXCEPTION 'Quantity must be above zero'; END IF;
  END LOOP;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments','[]'::jsonb)) LOOP
    v_paid := v_paid + COALESCE((v_pay->>'amount')::NUMERIC, 0);
    IF (v_pay->>'method') = 'credit' THEN v_new_credit := v_new_credit + COALESCE((v_pay->>'amount')::NUMERIC, 0); END IF;
  END LOOP;
  IF round(v_paid, 2) <> round(v_total, 2) THEN
    RAISE EXCEPTION 'Payment total does not match the new order total';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_old_credit FROM public.payments WHERE invoice_id = _invoice_id AND method = 'credit';

  IF v_new_credit > 0 AND v_inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'Credit needs a customer. This order has no customer.';
  END IF;
  IF v_inv.customer_id IS NOT NULL AND (v_old_credit > 0 OR v_new_credit > 0) THEN
    SELECT * INTO v_cust FROM public.customers WHERE id = v_inv.customer_id AND restaurant_id = v_rid FOR UPDATE;
    IF v_cust IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
    IF v_new_credit > 0 AND v_cust.credit_limit > 0 AND (v_cust.outstanding - v_old_credit + v_new_credit) > v_cust.credit_limit THEN
      RAISE EXCEPTION 'Customer credit limit exceeded';
    END IF;
    UPDATE public.customers
    SET outstanding = GREATEST(0, outstanding - v_old_credit + v_new_credit)
    WHERE id = v_inv.customer_id AND restaurant_id = v_rid;
  END IF;

  DELETE FROM public.invoice_items WHERE invoice_id = _invoice_id;
  DELETE FROM public.payments WHERE invoice_id = _invoice_id;

  UPDATE public.invoices SET
    subtotal = COALESCE((payload->'totals'->>'subtotal')::NUMERIC, 0),
    item_discount = COALESCE((payload->'totals'->>'itemDiscount')::NUMERIC, 0),
    bill_discount = COALESCE((payload->'totals'->>'billDiscount')::NUMERIC, 0),
    taxable_amount = COALESCE((payload->'totals'->>'taxableAmount')::NUMERIC, 0),
    cgst = COALESCE((payload->'totals'->>'cgst')::NUMERIC, 0),
    sgst = COALESCE((payload->'totals'->>'sgst')::NUMERIC, 0),
    igst = COALESCE((payload->'totals'->>'igst')::NUMERIC, 0),
    round_off = COALESCE((payload->'totals'->>'roundOff')::NUMERIC, 0),
    grand_total = v_total,
    cost_total = COALESCE((payload->'totals'->>'costTotal')::NUMERIC, 0),
    payment_method = COALESCE(payload->>'paymentMethod', v_inv.payment_method),
    notes = COALESCE(payload->>'notes', v_inv.notes)
  WHERE id = _invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, sku, hsn_code, unit, quantity, unit_price,
      purchase_price, discount, gst_rate, taxable_amount, cgst, sgst, igst, line_total
    ) VALUES (
      _invoice_id, (v_item->>'productId')::UUID, v_item->>'name', v_item->>'sku',
      v_item->>'hsnCode', v_item->>'unit',
      (v_item->>'quantity')::NUMERIC, (v_item->>'unitPrice')::NUMERIC,
      COALESCE((v_item->>'purchasePrice')::NUMERIC, 0),
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      COALESCE((v_item->>'gstRate')::NUMERIC, 0),
      COALESCE((v_item->>'taxableAmount')::NUMERIC, 0),
      COALESCE((v_item->>'cgst')::NUMERIC, 0),
      COALESCE((v_item->>'sgst')::NUMERIC, 0),
      COALESCE((v_item->>'igst')::NUMERIC, 0),
      COALESCE((v_item->>'lineTotal')::NUMERIC, 0)
    );
  END LOOP;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments','[]'::jsonb)) LOOP
    INSERT INTO public.payments (invoice_id, method, amount, reference)
    VALUES (_invoice_id, v_pay->>'method', (v_pay->>'amount')::NUMERIC, NULLIF(v_pay->>'reference', ''));
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'order_edited', 'invoice', _invoice_id,
          jsonb_build_object('invoice_number', v_inv.invoice_number, 'grand_total', v_inv.grand_total),
          jsonb_build_object('grand_total', v_total));

  -- keep the day book for that date in step
  PERFORM public.recalc_day_books_from((v_inv.invoice_date AT TIME ZONE 'Asia/Kolkata')::date);

  RETURN jsonb_build_object('id', _invoice_id, 'invoice_number', v_inv.invoice_number, 'grand_total', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.edit_sale(UUID, JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
