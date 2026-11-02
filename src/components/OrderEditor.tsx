import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { explainError } from "@/lib/errors";
import { formatCurrency } from "@/lib/format";
import { computeBill, type CartLineInput } from "@/lib/tax";
import type { AllSettings } from "@/types";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;
type InvoiceItem = Tables<"invoice_items">;
type Payment = Tables<"payments">;

interface EditLine extends CartLineInput {
  key: string;
}

const METHODS = ["cash", "upi", "card", "credit"] as const;
const money = (v: number | string | null | undefined) => formatCurrency(Number(v) || 0);

let counter = 0;
const nextKey = () => `edit-${++counter}`;

/**
 * Edit an existing order: change quantities or rates, cancel (remove) individual
 * items, add extra menu items and change how it was paid. Totals and GST are
 * recalculated with the same maths the billing screen uses.
 */
export function OrderEditor({
  invoice,
  items,
  payments,
  settings,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  settings: AllSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<EditLine[]>(() =>
    items.map((i) => ({
      key: nextKey(),
      productId: i.product_id ?? "",
      name: i.product_name,
      sku: i.sku,
      hsnCode: i.hsn_code,
      unit: i.unit,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      purchasePrice: Number(i.purchase_price),
      gstRate: Number(i.gst_rate),
      priceIncludesTax: true,
      discountType: "amount" as const,
      discountValue: Number(i.discount),
    })),
  );
  const [billDiscount, setBillDiscount] = useState(Number(invoice.bill_discount) || 0);
  const [method, setMethod] = useState<string>(
    payments.length === 1 ? (payments[0]!.method as string) : (invoice.payment_method ?? "cash"),
  );
  const [pick, setPick] = useState("");
  const signature = (ls: EditLine[], disc: number, m: string) =>
    ls.map((l) => `${l.productId}:${l.quantity}:${l.unitPrice}:${l.discountValue ?? 0}`).join("|") + `#${disc}#${m}`;
  const [initialSignature] = useState(() =>
    signature(lines, Number(invoice.bill_discount) || 0, payments.length === 1 ? (payments[0]!.method as string) : (invoice.payment_method ?? "cash")),
  );

  const { data: menu = [] } = useQuery({
    queryKey: ["order-editor-menu"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const interState = Number(invoice.igst) > 0;
  const bill = useMemo(
    () =>
      computeBill(
        lines,
        { type: "amount", value: billDiscount },
        {
          shopState: settings.tax.shopState || "home",
          customerState: interState ? "other-state" : settings.tax.shopState || "home",
        },
      ),
    [lines, billDiscount, settings.tax.shopState, interState],
  );

  const oldTotal = Number(invoice.grand_total);
  const diff = Math.round((bill.grandTotal - oldTotal) * 100) / 100;
  const hasBadLine = lines.some((l) => !(l.quantity > 0) || !l.productId);

  const patch = (key: string, change: Partial<EditLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));

  function addItem(productId: string) {
    const p = menu.find((m) => m.id === productId);
    if (!p) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          key: nextKey(),
          productId: p.id,
          name: p.name,
          sku: p.sku,
          hsnCode: p.hsn_code,
          unit: p.unit,
          quantity: 1,
          unitPrice: Number(p.selling_price),
          purchasePrice: Number(p.purchase_price),
          gstRate: Number(p.gst_rate),
          priceIncludesTax: true,
          discountType: "amount" as const,
          discountValue: 0,
        },
      ];
    });
    setPick("");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("An order needs at least one item. Use Cancel order to cancel all of it.");
      if (hasBadLine) throw new Error("Every item needs a quantity above zero.");
      const payload = {
        paymentMethod: method,
        items: bill.lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          sku: l.sku,
          hsnCode: l.hsnCode,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          purchasePrice: l.purchasePrice ?? 0,
          discount: l.discount,
          gstRate: l.gstRate,
          taxableAmount: l.taxableAmount,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
          lineTotal: l.lineTotal,
        })),
        payments: [{ method, amount: bill.grandTotal, reference: null }],
        totals: {
          subtotal: bill.subtotal,
          itemDiscount: bill.itemDiscount,
          billDiscount: bill.billDiscount,
          taxableAmount: bill.taxableAmount,
          cgst: bill.cgst,
          sgst: bill.sgst,
          igst: bill.igst,
          roundOff: bill.roundOff,
          grandTotal: bill.grandTotal,
          costTotal: bill.costTotal,
        },
      };
      const { error } = await supabase.rpc("edit_sale", { _invoice_id: invoice.id, payload: payload as never });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order updated");
      void queryClient.invalidateQueries();
      onSaved();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const changed = payments.length > 1 || signature(lines, billDiscount, method) !== initialSignature;

  return (
    <div className="space-y-4 text-sm">
      <p className="rounded-md bg-accent px-3 py-2 text-accent-foreground">
        Editing order <strong>{invoice.invoice_number}</strong>. Change quantities, remove an item with ✕, or add extra
        items. The total and GST are recalculated when you save.
      </p>

      <div className="space-y-2">
        {lines.map((l, i) => {
          const t = bill.lines[i];
          return (
            <div key={l.key} className="rounded-lg border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-tight">{l.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    aria-label="Decrease quantity"
                    onClick={() => patch(l.key, { quantity: Math.max(1, l.quantity - 1) })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    className="h-8 w-16 text-center"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => patch(l.key, { quantity: Number(e.target.value) || 0 })}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    aria-label="Increase quantity"
                    onClick={() => patch(l.key, { quantity: l.quantity + 1 })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Rate ₹
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={l.unitPrice}
                    onChange={(e) => patch(l.key, { unitPrice: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Disc ₹
                  <Input
                    className="h-8 w-16"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={l.discountValue ?? 0}
                    onChange={(e) => patch(l.key, { discountValue: Number(e.target.value) || 0 })}
                  />
                </label>
                <span className="w-20 text-right font-mono font-semibold">{money(t?.lineTotal ?? 0)}</span>
              </div>
            </div>
          );
        })}
        {!lines.length && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-muted-foreground">
            No items left. Add an item below, or close this and use <strong>Cancel order</strong>.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Add an extra item</Label>
        <Select value={pick} onValueChange={addItem}>
          <SelectTrigger>
            <SelectValue placeholder="Choose from the menu…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {menu.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} — {formatCurrency(Number(m.selling_price))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Bill discount (₹)</Label>
          <Input
            type="number"
            min="0"
            inputMode="decimal"
            value={billDiscount}
            onChange={(e) => setBillDiscount(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label>Paid by</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m} className="capitalize">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {payments.length > 1 && (
        <p className="text-xs text-muted-foreground">
          This order was paid in {payments.length} parts. Saving replaces them with one payment of the new total.
        </p>
      )}

      <div className="space-y-1 rounded-lg bg-muted p-3">
        <Row label="Subtotal" value={money(bill.subtotal)} />
        {bill.itemDiscount > 0 && <Row label="Item discount" value={`−${money(bill.itemDiscount)}`} />}
        {bill.billDiscount > 0 && <Row label="Bill discount" value={`−${money(bill.billDiscount)}`} />}
        {bill.taxTotal > 0 && <Row label="GST" value={money(bill.taxTotal)} />}
        {bill.roundOff !== 0 && <Row label="Round off" value={money(bill.roundOff)} />}
        <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
          <span>New total</span>
          <span className="font-mono">{money(bill.grandTotal)}</span>
        </div>
        <Row
          label={`Was ${money(oldTotal)}`}
          value={diff === 0 ? "no change" : diff > 0 ? `+${money(diff)} to collect` : `${money(-diff)} to refund`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!lines.length || hasBadLine || !changed || save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
