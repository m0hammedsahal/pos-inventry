-- =====================================================================
-- Malba Ree POS & Inventory — complete database (multi-restaurant)
-- Run this ONCE on a brand-new Supabase project:
--   Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
--
-- How multi-restaurant works
--   * A user can belong to many restaurants (restaurant_members, with a role each).
--   * The app tells the database which restaurant is active by sending the
--     "x-restaurant-id" header on every request.
--   * Every business table has a restaurant_id column that defaults to that
--     restaurant, and row-level security only shows rows of the active
--     restaurant to its members. Menu, kitchen stock, orders, expenses,
--     staff, settings... are therefore completely separate per restaurant.
-- =====================================================================

CREATE TYPE public.app_role AS ENUM ('admin','manager','cashier');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------
-- PROFILES (one per login)
-- ---------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- RESTAURANTS + MEMBERS
-- ---------------------------------------------------------------------
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER t_rest_upd BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.restaurant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'cashier',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, user_id)
);
CREATE INDEX idx_members_user ON public.restaurant_members(user_id);

-- The active restaurant, sent by the app in the x-restaurant-id request header.
CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE h TEXT; v UUID;
BEGIN
  h := current_setting('request.headers', true);
  IF h IS NULL OR h = '' THEN RETURN NULL; END IF;
  BEGIN
    v := NULLIF(h::json ->> 'x-restaurant-id', '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.is_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_members m
    WHERE m.user_id = auth.uid() AND m.restaurant_id = public.current_restaurant_id()
  )
$$;

-- True when the row belongs to the active restaurant AND the caller is a member of it.
CREATE OR REPLACE FUNCTION public.can_access(rid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rid IS NOT NULL AND rid = public.current_restaurant_id() AND public.is_member()
$$;

-- Role inside the ACTIVE restaurant ('admin' = owner).
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_members m
    WHERE m.user_id = _user_id AND m.role = _role AND m.restaurant_id = public.current_restaurant_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.shares_restaurant_with(_other UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_members a
    JOIN public.restaurant_members b ON a.restaurant_id = b.restaurant_id
    WHERE a.user_id = auth.uid() AND b.user_id = _other
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.restaurants TO authenticated;
GRANT SELECT ON public.restaurant_members TO authenticated;
GRANT ALL ON public.profiles, public.restaurants, public.restaurant_members TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles own or teammates" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_restaurant_with(id));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "restaurants read members" ON public.restaurants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurant_members m WHERE m.restaurant_id = restaurants.id AND m.user_id = auth.uid()));
CREATE POLICY "restaurants update admin" ON public.restaurants FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurant_members m WHERE m.restaurant_id = restaurants.id AND m.user_id = auth.uid() AND m.role = 'admin'));

CREATE POLICY "members read own" ON public.restaurant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.settings (
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, key)
);

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_idx ON public.categories (restaurant_id, lower(name));
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER t_sup_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name TEXT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  brand TEXT,
  description TEXT,
  image_url TEXT,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  hsn_code TEXT,
  unit TEXT NOT NULL DEFAULT 'piece',
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_sku_idx ON public.products (restaurant_id, sku);
CREATE UNIQUE INDEX products_barcode_idx ON public.products (restaurant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_name ON public.products (restaurant_id, name);
CREATE INDEX idx_products_parent ON public.products (parent_id);
CREATE TRIGGER t_prod_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  state TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail',
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON public.customers (restaurant_id, phone);
CREATE TRIGGER t_cust_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  cashier_id UUID,
  cashier_name TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  bill_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  round_off NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'completed',
  cancel_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invoices_number_idx ON public.invoices (restaurant_id, invoice_number);
CREATE INDEX idx_invoices_date ON public.invoices (restaurant_id, invoice_date);
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  unit TEXT,
  quantity NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  returned_qty NUMERIC(12,3) NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items (invoice_id);
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  note TEXT,
  collected_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kitchen_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  min_stock numeric(12,3) NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kitchen_items_name_active_idx ON public.kitchen_items (restaurant_id, lower(name)) WHERE is_active;
CREATE TRIGGER kitchen_items_touch BEFORE UPDATE ON public.kitchen_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.kitchen_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.kitchen_items(id) ON DELETE CASCADE,
  type text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  balance_after numeric(12,3),
  reference_type text,
  reference_id uuid,
  reason text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kitchen_sm_item_idx ON public.kitchen_stock_movements (item_id, created_at DESC);
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  invoice_number TEXT,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  purchase_price NUMERIC(12,2) NOT NULL,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE public.purchase_items ADD COLUMN kitchen_item_id UUID REFERENCES public.kitchen_items(id) ON DELETE SET NULL;
CREATE TABLE public.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  return_number TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_method TEXT NOT NULL DEFAULT 'cash',
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sales_returns_number_idx ON public.sales_returns (restaurant_id, return_number);
CREATE TABLE public.sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  return_id UUID NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  invoice_item_id UUID REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancelled_by UUID,
  ADD CONSTRAINT expenses_status_check CHECK (status IN ('active', 'cancelled'));
CREATE INDEX idx_expenses_date ON public.expenses (restaurant_id, expense_date);
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_categories_name_idx ON public.expense_categories (restaurant_id, lower(name));
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_counters (
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  year INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, year)
);

CREATE TABLE public.day_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_locked boolean NOT NULL DEFAULT false,
  extra_cash_sales numeric NOT NULL DEFAULT 0,
  extra_upi_sales numeric NOT NULL DEFAULT 0,
  extra_card_sales numeric NOT NULL DEFAULT 0,
  extra_note text,
  bill_sales numeric NOT NULL DEFAULT 0,
  expenses_total numeric NOT NULL DEFAULT 0,
  closing_balance numeric NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX day_books_date_idx ON public.day_books (restaurant_id, business_date DESC);
CREATE TRIGGER day_books_touch BEFORE UPDATE ON public.day_books FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  designation text,
  daily_wage numeric(12,2) NOT NULL DEFAULT 0,
  joined_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_members_touch BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL,
  marked_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_attendance_status_check CHECK (status IN ('full_day', 'half_day')),
  CONSTRAINT staff_attendance_unique UNIQUE (staff_id, attendance_date)
);
CREATE INDEX staff_attendance_date_idx ON public.staff_attendance (restaurant_id, attendance_date);
CREATE TRIGGER staff_attendance_touch BEFORE UPDATE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- ACCESS RULES (row-level security) — every table is scoped to the active restaurant
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.settings FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "settings write admin" ON public.settings FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.can_access(restaurant_id) AND public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories read" ON public.categories FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "categories write" ON public.categories FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers read" ON public.suppliers FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "suppliers write" ON public.suppliers FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "products write" ON public.products FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "customers write" ON public.customers FOR ALL TO authenticated
  USING (public.can_access(restaurant_id))
  WITH CHECK (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices read" ON public.invoices FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "invoices insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
CREATE POLICY "invoices update" ON public.invoices FOR UPDATE TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_items read" ON public.invoice_items FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "invoice_items insert" ON public.invoice_items FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
CREATE POLICY "invoice_items update" ON public.invoice_items FOR UPDATE TO authenticated
  USING (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read" ON public.payments FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "payments insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_payments read" ON public.customer_payments FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "customer_payments insert" ON public.customer_payments FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_items TO authenticated;
GRANT ALL ON public.kitchen_items TO service_role;
ALTER TABLE public.kitchen_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kitchen_items read" ON public.kitchen_items FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "kitchen_items write" ON public.kitchen_items FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_stock_movements TO authenticated;
GRANT ALL ON public.kitchen_stock_movements TO service_role;
ALTER TABLE public.kitchen_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kitchen_stock_movements read" ON public.kitchen_stock_movements FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "kitchen_stock_movements insert" ON public.kitchen_stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases read" ON public.purchases FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "purchases write" ON public.purchases FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items read" ON public.purchase_items FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "purchase_items write" ON public.purchase_items FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_returns read" ON public.sales_returns FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "sales_returns insert" ON public.sales_returns FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_items TO authenticated;
GRANT ALL ON public.sales_return_items TO service_role;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_return_items read" ON public.sales_return_items FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "sales_return_items insert" ON public.sales_return_items FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "expenses write" ON public.expenses FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_categories read" ON public.expense_categories FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "expense_categories insert" ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "expense_categories delete custom" ON public.expense_categories FOR DELETE TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND NOT is_default);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs read" ON public.audit_logs FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit_logs insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_counters TO authenticated;
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_counters read" ON public.invoice_counters FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_books TO authenticated;
GRANT ALL ON public.day_books TO service_role;
ALTER TABLE public.day_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "day_books read" ON public.day_books FOR SELECT TO authenticated USING (public.can_access(restaurant_id));
CREATE POLICY "day_books write" ON public.day_books FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_members read" ON public.staff_members FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "staff_members write" ON public.staff_members FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_attendance read" ON public.staff_attendance FOR SELECT TO authenticated USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY "staff_attendance write" ON public.staff_attendance FOR ALL TO authenticated
  USING (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (public.can_access(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));

-- ---------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y INT := EXTRACT(YEAR FROM now())::INT; n INT; p TEXT; rid UUID := public.current_restaurant_id();
BEGIN
  IF NOT public.is_member() THEN RAISE EXCEPTION 'You do not have access to this restaurant'; END IF;
  INSERT INTO public.invoice_counters(restaurant_id, year, last_number) VALUES (rid, y, 1)
  ON CONFLICT (restaurant_id, year) DO UPDATE SET last_number = public.invoice_counters.last_number + 1
  RETURNING last_number INTO n;
  SELECT COALESCE(value->>'prefix','INV') INTO p FROM public.settings WHERE key='invoice' AND restaurant_id = rid;
  RETURN COALESCE(p,'INV') || '-' || y || '-' || lpad(n::text, 6, '0');
END;
$$;
CREATE OR REPLACE FUNCTION public.create_sale(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_number TEXT;
  v_item JSONB;
  v_pay JSONB;
  v_paid NUMERIC := 0;
  v_total NUMERIC := COALESCE((payload->'totals'->>'grandTotal')::NUMERIC, 0);
  v_customer_id UUID := NULLIF(payload->>'customerId','')::UUID;
  v_credit NUMERIC := 0;
  v_cust RECORD;
BEGIN
  IF NOT public.is_member() THEN RAISE EXCEPTION 'You do not have access to this restaurant'; END IF;
  IF jsonb_array_length(COALESCE(payload->'items','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- every line must be a real menu item
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = (v_item->>'productId')::UUID AND restaurant_id = public.current_restaurant_id()) THEN
      RAISE EXCEPTION 'Menu item not found';
    END IF;
  END LOOP;

  -- validate payments
  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments','[]'::jsonb)) LOOP
    v_paid := v_paid + COALESCE((v_pay->>'amount')::NUMERIC,0);
    IF (v_pay->>'method') = 'credit' THEN
      v_credit := v_credit + COALESCE((v_pay->>'amount')::NUMERIC,0);
    END IF;
  END LOOP;
  IF round(v_paid,2) <> round(v_total,2) THEN
    RAISE EXCEPTION 'Payment total does not match the invoice total';
  END IF;

  IF v_credit > 0 THEN
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'Select a customer for credit sales';
    END IF;
    SELECT * INTO v_cust FROM public.customers WHERE id = v_customer_id AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
    IF v_cust IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_cust.credit_limit > 0 AND (v_cust.outstanding + v_credit) > v_cust.credit_limit THEN
      RAISE EXCEPTION 'Customer credit limit exceeded';
    END IF;
  END IF;

  v_number := public.next_invoice_number();

  INSERT INTO public.invoices (
    invoice_number, customer_id, customer_name, cashier_id, cashier_name,
    subtotal, item_discount, bill_discount, taxable_amount, cgst, sgst, igst,
    round_off, grand_total, cost_total, payment_method, notes
  ) VALUES (
    v_number, v_customer_id, payload->>'customerName', auth.uid(), payload->>'cashierName',
    COALESCE((payload->'totals'->>'subtotal')::NUMERIC,0),
    COALESCE((payload->'totals'->>'itemDiscount')::NUMERIC,0),
    COALESCE((payload->'totals'->>'billDiscount')::NUMERIC,0),
    COALESCE((payload->'totals'->>'taxableAmount')::NUMERIC,0),
    COALESCE((payload->'totals'->>'cgst')::NUMERIC,0),
    COALESCE((payload->'totals'->>'sgst')::NUMERIC,0),
    COALESCE((payload->'totals'->>'igst')::NUMERIC,0),
    COALESCE((payload->'totals'->>'roundOff')::NUMERIC,0),
    v_total,
    COALESCE((payload->'totals'->>'costTotal')::NUMERIC,0),
    COALESCE(payload->>'paymentMethod','cash'),
    payload->>'notes'
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, sku, hsn_code, unit, quantity, unit_price,
      purchase_price, discount, gst_rate, taxable_amount, cgst, sgst, igst, line_total
    ) VALUES (
      v_invoice_id, (v_item->>'productId')::UUID, v_item->>'name', v_item->>'sku',
      v_item->>'hsnCode', v_item->>'unit',
      (v_item->>'quantity')::NUMERIC, (v_item->>'unitPrice')::NUMERIC,
      COALESCE((v_item->>'purchasePrice')::NUMERIC,0),
      COALESCE((v_item->>'discount')::NUMERIC,0),
      COALESCE((v_item->>'gstRate')::NUMERIC,0),
      COALESCE((v_item->>'taxableAmount')::NUMERIC,0),
      COALESCE((v_item->>'cgst')::NUMERIC,0),
      COALESCE((v_item->>'sgst')::NUMERIC,0),
      COALESCE((v_item->>'igst')::NUMERIC,0),
      COALESCE((v_item->>'lineTotal')::NUMERIC,0)
    );
  END LOOP;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments','[]'::jsonb)) LOOP
    INSERT INTO public.payments (invoice_id, method, amount, reference)
    VALUES (v_invoice_id, v_pay->>'method', (v_pay->>'amount')::NUMERIC, NULLIF(v_pay->>'reference',''));
  END LOOP;

  IF v_credit > 0 THEN
    UPDATE public.customers SET outstanding = outstanding + v_credit WHERE id = v_customer_id AND restaurant_id = public.current_restaurant_id();
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity, entity_id, new_value)
  VALUES (auth.uid(), payload->>'cashierName', 'sale_completed', 'invoice', v_invoice_id,
          jsonb_build_object('invoice_number', v_number, 'grand_total', v_total));

  RETURN jsonb_build_object('id', v_invoice_id, 'invoice_number', v_number);
END;
$$;
CREATE OR REPLACE FUNCTION public.create_sales_return(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_id UUID;
  v_number TEXT;
  v_item JSONB;
  v_total NUMERIC := 0;
  v_invoice_id UUID := (payload->>'invoiceId')::UUID;
  v_sold NUMERIC;
  v_returned NUMERIC;
  v_inv RECORD;
BEGIN
  IF NOT public.is_member() THEN RAISE EXCEPTION 'You do not have access to this restaurant'; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = v_invoice_id AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'Invoice is cancelled'; END IF;

  v_number := 'RET-' || to_char(now(),'YYYY') || '-' || lpad((
    (SELECT count(*) + 1 FROM public.sales_returns WHERE restaurant_id = public.current_restaurant_id()))::text, 6, '0');

  INSERT INTO public.sales_returns (invoice_id, return_number, refund_method, reason, created_by)
  VALUES (v_invoice_id, v_number, COALESCE(payload->>'refundMethod','cash'), payload->>'reason', auth.uid())
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    SELECT quantity, returned_qty INTO v_sold, v_returned FROM public.invoice_items
      WHERE id = (v_item->>'invoiceItemId')::UUID AND invoice_id = v_invoice_id FOR UPDATE;
    IF v_sold IS NULL THEN RAISE EXCEPTION 'Invoice item not found'; END IF;
    IF (v_returned + (v_item->>'quantity')::NUMERIC) > v_sold THEN
      RAISE EXCEPTION 'Return quantity exceeds sold quantity';
    END IF;

    UPDATE public.invoice_items SET returned_qty = returned_qty + (v_item->>'quantity')::NUMERIC
      WHERE id = (v_item->>'invoiceItemId')::UUID AND invoice_id = v_invoice_id;

    INSERT INTO public.sales_return_items (return_id, invoice_item_id, product_id, product_name, quantity, amount)
    VALUES (v_return_id, (v_item->>'invoiceItemId')::UUID, NULLIF(v_item->>'productId','')::UUID,
            v_item->>'productName', (v_item->>'quantity')::NUMERIC, COALESCE((v_item->>'amount')::NUMERIC,0));

    v_total := v_total + COALESCE((v_item->>'amount')::NUMERIC,0);
  END LOOP;

  UPDATE public.sales_returns SET total_amount = v_total WHERE id = v_return_id;

  IF v_inv.payment_method = 'credit' AND v_inv.customer_id IS NOT NULL THEN
    UPDATE public.customers SET outstanding = GREATEST(0, outstanding - v_total) WHERE id = v_inv.customer_id AND restaurant_id = public.current_restaurant_id();
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (auth.uid(), 'sales_return', 'sales_return', v_return_id,
          jsonb_build_object('return_number', v_number, 'amount', v_total, 'invoice', v_inv.invoice_number));

  RETURN jsonb_build_object('id', v_return_id, 'return_number', v_number, 'total', v_total);
END;
$$;
CREATE OR REPLACE FUNCTION public.create_purchase(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID; v_item JSONB; v_sub NUMERIC := 0; v_tax NUMERIC := 0; v_stock NUMERIC;
  v_qty NUMERIC; v_price NUMERIC; v_item_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF jsonb_array_length(COALESCE(payload->'items','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Add at least one item';
  END IF;

  INSERT INTO public.purchases (supplier_id, supplier_name, invoice_number, purchase_date, created_by)
  VALUES (NULLIF(payload->>'supplierId','')::UUID, payload->>'supplierName', payload->>'invoiceNumber',
          COALESCE((payload->>'purchaseDate')::TIMESTAMPTZ, now()), auth.uid())
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    v_item_id := (v_item->>'itemId')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'purchasePrice')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;

    v_sub := v_sub + v_qty * v_price;
    v_tax := v_tax + (v_qty * v_price) * COALESCE((v_item->>'gstRate')::NUMERIC,0) / 100;

    INSERT INTO public.purchase_items (purchase_id, kitchen_item_id, product_name, quantity, purchase_price, gst_rate, line_total)
    VALUES (v_id, v_item_id, v_item->>'itemName', v_qty, v_price,
            COALESCE((v_item->>'gstRate')::NUMERIC,0), v_qty * v_price);

    UPDATE public.kitchen_items SET current_stock = current_stock + v_qty, cost_price = v_price
      WHERE id = v_item_id AND is_active AND restaurant_id = public.current_restaurant_id() RETURNING current_stock INTO v_stock;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'A purchased item is no longer in Kitchen Stock'; END IF;

    INSERT INTO public.kitchen_stock_movements (item_id, type, quantity, balance_after, reference_type, reference_id, reason, user_id)
    VALUES (v_item_id, 'purchase', v_qty, v_stock, 'purchase', v_id, 'Purchase entry', auth.uid());
  END LOOP;

  UPDATE public.purchases SET subtotal = v_sub, tax_total = v_tax, grand_total = v_sub + v_tax WHERE id = v_id;
  RETURN jsonb_build_object('id', v_id, 'total', v_sub + v_tax);
END;
$$;
CREATE OR REPLACE FUNCTION public.cancel_invoice(_invoice_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = _invoice_id AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status = 'cancelled' THEN RETURN; END IF;

  IF v_inv.payment_method = 'credit' AND v_inv.customer_id IS NOT NULL THEN
    UPDATE public.customers SET outstanding = GREATEST(0, outstanding - v_inv.grand_total) WHERE id = v_inv.customer_id AND restaurant_id = public.current_restaurant_id();
  END IF;

  UPDATE public.invoices SET status = 'cancelled', cancel_reason = _reason WHERE id = _invoice_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'invoice_cancelled', 'invoice', _invoice_id,
          jsonb_build_object('status','completed'), jsonb_build_object('status','cancelled','reason',_reason));
END;
$$;
CREATE OR REPLACE FUNCTION public.collect_customer_payment(_customer_id UUID, _amount NUMERIC, _method TEXT, _reference TEXT, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member() THEN RAISE EXCEPTION 'You do not have access to this restaurant'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND restaurant_id = public.current_restaurant_id()) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  INSERT INTO public.customer_payments (customer_id, amount, method, reference, note, collected_by)
  VALUES (_customer_id, _amount, COALESCE(_method,'cash'), _reference, _note, auth.uid());
  UPDATE public.customers SET outstanding = GREATEST(0, outstanding - _amount)
  WHERE id = _customer_id AND restaurant_id = public.current_restaurant_id();
END;
$$;
CREATE OR REPLACE FUNCTION public.kitchen_add_item(
  _name text, _unit text, _opening numeric DEFAULT 0, _min numeric DEFAULT 0, _cost numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_name text := btrim(COALESCE(_name, ''));
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Only a manager or admin can change kitchen stock';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Enter a name for the product'; END IF;
  IF COALESCE(_opening, 0) < 0 OR COALESCE(_min, 0) < 0 OR COALESCE(_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Quantities and cost cannot be negative';
  END IF;

  BEGIN
    INSERT INTO public.kitchen_items (name, unit, current_stock, min_stock, cost_price)
    VALUES (v_name, COALESCE(NULLIF(btrim(_unit), ''), 'kg'), COALESCE(_opening, 0), COALESCE(_min, 0), COALESCE(_cost, 0))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '% is already in Kitchen Stock', v_name;
  END;

  IF COALESCE(_opening, 0) > 0 THEN
    INSERT INTO public.kitchen_stock_movements (item_id, type, quantity, balance_after, reference_type, reason, user_id)
    VALUES (v_id, 'opening', _opening, _opening, 'manual', 'Opening stock', auth.uid());
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (auth.uid(), 'kitchen_item_added', 'kitchen_item', v_id, jsonb_build_object('name', v_name));
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.kitchen_stock_adjust(_item_id uuid, _delta numeric, _type text, _reason text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_bal numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Only a manager or admin can change kitchen stock';
  END IF;
  IF _delta IS NULL OR _delta = 0 THEN RAISE EXCEPTION 'Enter a quantity'; END IF;

  SELECT current_stock INTO v_bal FROM public.kitchen_items WHERE id = _item_id AND is_active AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Product not found in Kitchen Stock'; END IF;
  IF v_bal + _delta < 0 THEN
    RAISE EXCEPTION 'Not enough stock — only % available', v_bal;
  END IF;

  UPDATE public.kitchen_items SET current_stock = current_stock + _delta WHERE id = _item_id AND restaurant_id = public.current_restaurant_id()
  RETURNING current_stock INTO v_bal;

  INSERT INTO public.kitchen_stock_movements (item_id, type, quantity, balance_after, reference_type, reason, user_id)
  VALUES (_item_id, COALESCE(NULLIF(_type, ''), CASE WHEN _delta > 0 THEN 'stock_in' ELSE 'stock_out' END),
          _delta, v_bal, 'manual', _reason, auth.uid());
  RETURN v_bal;
END;
$$;
CREATE OR REPLACE FUNCTION public.kitchen_remove_item(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name text; v_bal numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Only a manager or admin can change kitchen stock';
  END IF;
  SELECT name, current_stock INTO v_name, v_bal FROM public.kitchen_items WHERE id = _item_id AND is_active AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Product not found in Kitchen Stock'; END IF;

  UPDATE public.kitchen_items SET is_active = false WHERE id = _item_id AND restaurant_id = public.current_restaurant_id();
  INSERT INTO public.kitchen_stock_movements (item_id, type, quantity, balance_after, reference_type, reason, user_id)
  VALUES (_item_id, 'removed', 0, v_bal, 'manual', 'Removed from Kitchen Stock', auth.uid());
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value)
  VALUES (auth.uid(), 'kitchen_item_removed', 'kitchen_item', _item_id, jsonb_build_object('name', v_name, 'stock', v_bal));
END;
$$;
CREATE OR REPLACE FUNCTION public.cancel_expense(_expense_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exp RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Only a manager or admin can cancel an expense';
  END IF;
  SELECT * INTO v_exp FROM public.expenses WHERE id = _expense_id AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF v_exp.status = 'cancelled' THEN RETURN; END IF;

  UPDATE public.expenses
  SET status = 'cancelled',
      cancel_reason = NULLIF(btrim(COALESCE(_reason, '')), ''),
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE id = _expense_id AND restaurant_id = public.current_restaurant_id();

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'expense_cancelled', 'expense', _expense_id,
          jsonb_build_object('title', v_exp.title, 'amount', v_exp.amount, 'date', v_exp.expense_date),
          jsonb_build_object('status', 'cancelled', 'reason', _reason));

  -- keep the day book (and every later day) in step
  PERFORM public.recalc_day_books_from(v_exp.expense_date);
END;
$$;
CREATE OR REPLACE FUNCTION public.recalc_day_books_from(_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid UUID := public.current_restaurant_id();
  r RECORD;
  prev_closing numeric;
  v_bills numeric;
  v_exp numeric;
BEGIN
  IF NOT public.is_member() THEN RAISE EXCEPTION 'You do not have access to this restaurant'; END IF;
  FOR r IN
    SELECT * FROM public.day_books WHERE restaurant_id = rid AND business_date >= _date ORDER BY business_date
  LOOP
    SELECT closing_balance INTO prev_closing
    FROM public.day_books
    WHERE restaurant_id = rid AND business_date < r.business_date
    ORDER BY business_date DESC
    LIMIT 1;

    SELECT COALESCE(SUM(grand_total), 0) INTO v_bills
    FROM public.invoices
    WHERE restaurant_id = rid AND status = 'completed'
      AND (invoice_date AT TIME ZONE 'Asia/Kolkata')::date = r.business_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_exp
    FROM public.expenses
    WHERE restaurant_id = rid AND expense_date = r.business_date AND status <> 'cancelled';

    UPDATE public.day_books
    SET opening_balance = CASE WHEN r.opening_locked OR prev_closing IS NULL THEN r.opening_balance ELSE prev_closing END,
        bill_sales = v_bills,
        expenses_total = v_exp,
        closing_balance = (CASE WHEN r.opening_locked OR prev_closing IS NULL THEN r.opening_balance ELSE prev_closing END)
          + v_bills + r.extra_cash_sales + r.extra_upi_sales + r.extra_card_sales - v_exp
    WHERE id = r.id;
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_day_book(
  _date date,
  _extra_cash numeric DEFAULT 0,
  _extra_upi numeric DEFAULT 0,
  _extra_card numeric DEFAULT 0,
  _note text DEFAULT NULL,
  _opening numeric DEFAULT NULL,
  _close boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_closing numeric;
  v_open numeric;
  v_locked boolean;
  result jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Only a manager or admin can update the day book';
  END IF;

  SELECT closing_balance INTO prev_closing
  FROM public.day_books
  WHERE business_date < _date AND restaurant_id = public.current_restaurant_id()
  ORDER BY business_date DESC
  LIMIT 1;

  v_locked := _opening IS NOT NULL;
  v_open := COALESCE(_opening, prev_closing, 0);

  INSERT INTO public.day_books AS d (business_date, opening_balance, opening_locked,
      extra_cash_sales, extra_upi_sales, extra_card_sales, extra_note,
      is_closed, closed_at, closed_by)
  VALUES (_date, v_open, v_locked,
      COALESCE(_extra_cash, 0), COALESCE(_extra_upi, 0), COALESCE(_extra_card, 0), _note,
      _close, CASE WHEN _close THEN now() ELSE NULL END, CASE WHEN _close THEN auth.uid() ELSE NULL END)
  ON CONFLICT (restaurant_id, business_date) DO UPDATE
  SET opening_balance = CASE WHEN v_locked THEN v_open ELSE d.opening_balance END,
      opening_locked = CASE WHEN v_locked THEN true ELSE d.opening_locked END,
      extra_cash_sales = COALESCE(_extra_cash, 0),
      extra_upi_sales = COALESCE(_extra_upi, 0),
      extra_card_sales = COALESCE(_extra_card, 0),
      extra_note = _note,
      is_closed = _close OR d.is_closed,
      closed_at = CASE WHEN _close THEN now() ELSE d.closed_at END,
      closed_by = CASE WHEN _close THEN auth.uid() ELSE d.closed_by END;

  PERFORM public.recalc_day_books_from(_date);

  SELECT to_jsonb(d) INTO result FROM public.day_books d WHERE d.business_date = _date AND d.restaurant_id = public.current_restaurant_id();
  RETURN result;
END;
$$;

-- Create a restaurant; the caller becomes its admin (owner). Starter data is added.
CREATE OR REPLACE FUNCTION public.create_restaurant(_name TEXT, _address TEXT DEFAULT NULL, _phone TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID; v_name TEXT := btrim(COALESCE(_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Enter a restaurant name'; END IF;

  INSERT INTO public.restaurants (name, address, phone, created_by)
  VALUES (v_name, NULLIF(btrim(COALESCE(_address,'')),''), NULLIF(btrim(COALESCE(_phone,'')),''), auth.uid())
  RETURNING id INTO rid;

  INSERT INTO public.restaurant_members (restaurant_id, user_id, role) VALUES (rid, auth.uid(), 'admin');

  INSERT INTO public.settings (restaurant_id, key, value) VALUES
    (rid, 'shop', jsonb_build_object('name', v_name, 'address', COALESCE(_address,''), 'phone', COALESCE(_phone,'')));

  INSERT INTO public.categories (restaurant_id, name) VALUES
    (rid,'Coffee & Tea'),(rid,'Juices'),(rid,'Shakes'),(rid,'Burgers'),(rid,'Wraps'),
    (rid,'Sandwiches'),(rid,'Snacks'),(rid,'Desserts'),(rid,'Beverages');

  INSERT INTO public.expense_categories (restaurant_id, name, is_default) VALUES
    (rid,'rent',true),(rid,'salary',true),(rid,'electricity',true),(rid,'transport',true),
    (rid,'supplies',true),(rid,'maintenance',true),(rid,'other',true);

  RETURN rid;
END;
$$;

-- Add an existing account (by email) to the ACTIVE restaurant, or change their role.
CREATE OR REPLACE FUNCTION public.add_restaurant_member(_email TEXT, _role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID; rid UUID := public.current_restaurant_id();
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only the restaurant admin can add team members'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(_email)) LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'No account found for % — ask them to sign up first, then add them again', _email; END IF;
  INSERT INTO public.restaurant_members (restaurant_id, user_id, role) VALUES (rid, uid, _role)
  ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (auth.uid(), 'member_added', 'user', uid, jsonb_build_object('role', _role, 'email', _email));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(_user_id UUID, _role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID := public.current_restaurant_id();
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_members WHERE restaurant_id = rid AND role = 'admin' AND user_id <> _user_id
  ) THEN RAISE EXCEPTION 'A restaurant needs at least one admin'; END IF;
  UPDATE public.restaurant_members SET role = _role WHERE restaurant_id = rid AND user_id = _user_id;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (auth.uid(), 'role_changed', 'user', _user_id, jsonb_build_object('role', _role));
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_restaurant_member(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID := public.current_restaurant_id();
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_members WHERE restaurant_id = rid AND role = 'admin' AND user_id <> _user_id
  ) THEN RAISE EXCEPTION 'A restaurant needs at least one admin'; END IF;
  DELETE FROM public.restaurant_members WHERE restaurant_id = rid AND user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_staff()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role public.app_role, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.email, m.role, m.created_at
  FROM public.restaurant_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.restaurant_id = public.current_restaurant_id()
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  ORDER BY m.created_at;
$$;

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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
NOTIFY pgrst, 'reload schema';
