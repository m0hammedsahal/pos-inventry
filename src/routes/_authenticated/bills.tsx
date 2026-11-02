import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Pencil, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateFilter } from "@/components/DateFilter";
import { OrderEditor } from "@/components/OrderEditor";
import { downloadCsv } from "@/lib/csv";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { endOfDay, formatCurrency, formatDateTime, formatNumber, isoDate, parseISODate, startOfDay } from "@/lib/format";
import { fetchSettings, readCachedSettings } from "@/services/settingsService";
import { printSlip } from "@/services/printing";
import type { ReceiptData } from "@/types";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({
    meta: [
      { title: "Orders — Malba Ree" },
      { name: "description", content: "Every order with its full item breakdown, reprint, return and cancel options." },
      { property: "og:title", content: "Orders — Malba Ree" },
      { property: "og:description", content: "Every order with its full item breakdown." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

const money = (v: number | string | null | undefined) => formatCurrency(Number(v) || 0);

function OrdersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const { data: settings = readCachedSettings() } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  // Each order comes with every item in it, so the list can show the full breakdown.
  const { data: orders = [] } = useQuery({
    queryKey: ["invoices", term, range?.from, range?.to],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*, invoice_items(id, product_name, quantity, unit_price, line_total, returned_qty)")
        .order("invoice_date", { ascending: false })
        .limit(100);
      if (range) {
        q = q
          .gte("invoice_date", startOfDay(parseISODate(range.from)).toISOString())
          .lte("invoice_date", endOfDay(parseISODate(range.to)).toISOString());
      }
      if (term.trim()) q = q.or(`invoice_number.ilike.%${term.trim()}%,customer_name.ilike.%${term.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["invoice-detail", openId],
    enabled: !!openId,
    queryFn: async () => {
      const [{ data: inv }, { data: items }, { data: pays }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", openId!).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", openId!),
        supabase.from("payments").select("*").eq("invoice_id", openId!),
      ]);
      return { inv, items: items ?? [], pays: pays ?? [] };
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt("Reason for cancelling this order?") ?? "";
      if (!reason) throw new Error("Cancellation reason required");
      const { error } = await supabase.rpc("cancel_invoice", { _invoice_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order cancelled");
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const doReturn = useMutation({
    mutationFn: async () => {
      const items = Object.entries(returnQty)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => {
          const item = detail!.items.find((i) => i.id === itemId)!;
          const rate = Number(item.line_total) / Number(item.quantity);
          return {
            invoiceItemId: itemId,
            productId: item.product_id,
            productName: item.product_name,
            quantity: qty,
            amount: Math.round(rate * qty * 100) / 100,
          };
        });
      if (!items.length) throw new Error("Enter at least one return quantity");
      const { error } = await supabase.rpc("create_sales_return", {
        payload: { invoiceId: openId, refundMethod: "cash", reason: "Customer return", items } as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Return recorded");
      setReturnQty({});
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  function reprint() {
    if (!detail?.inv) return;
    const receipt: ReceiptData = {
      invoiceNumber: detail.inv.invoice_number,
      date: detail.inv.invoice_date,
      cashierName: detail.inv.cashier_name ?? "",
      customerName: detail.inv.customer_name,
      customerGstin: null,
      items: detail.items.map((i) => ({
        name: i.product_name,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPrice: Number(i.unit_price),
        hsnCode: i.hsn_code,
        gstRate: Number(i.gst_rate),
        discount: Number(i.discount),
        taxableAmount: Number(i.taxable_amount),
        cgst: Number(i.cgst),
        sgst: Number(i.sgst),
        igst: Number(i.igst),
        lineTotal: Number(i.line_total),
      })),
      subtotal: Number(detail.inv.subtotal),
      itemDiscount: Number(detail.inv.item_discount),
      billDiscount: Number(detail.inv.bill_discount),
      taxableAmount: Number(detail.inv.taxable_amount),
      cgst: Number(detail.inv.cgst),
      sgst: Number(detail.inv.sgst),
      igst: Number(detail.inv.igst),
      roundOff: Number(detail.inv.round_off),
      grandTotal: Number(detail.inv.grand_total),
      payments: detail.pays.map((p) => ({
        method: p.method as ReceiptData["payments"][number]["method"],
        amount: Number(p.amount),
      })),
      shop: settings.shop,
      footer: settings.invoice.footer,
    };
    void printSlip(receipt, settings, { kot: false }).then((res) => {
      if (res.ok && !res.usedFallback) toast.success(res.message);
      else if (res.ok) toast.message(res.message);
      else toast.error(res.message);
    });
  }

  const shownOrders = orders.filter((o) => status === "all" || o.status === status);
  const inv = detail?.inv;
  const detailItems = detail?.items ?? [];
  const detailPays = detail?.pays ?? [];
  const itemCount = detailItems.reduce((s, i) => s + Number(i.quantity), 0);

  return (
    <>
      <PageHeader title="Orders" description="Every order with the full list of items in it — reprint, return or cancel." />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search order number or customer"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full sm:w-72"
          />
          <DateFilter
            from={range?.from ?? isoDate(new Date())}
            to={range?.to ?? isoDate(new Date())}
            onChange={(from, to) => setRange({ from, to })}
          />
          {range && (
            <Button variant="ghost" size="sm" onClick={() => setRange(null)}>
              <X className="size-4" /> All dates
            </Button>
          )}
          <div className="flex rounded-md border border-border p-0.5">
            {(["all", "completed", "cancelled"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={status === v ? "secondary" : "ghost"}
                className="h-7 capitalize"
                onClick={() => setStatus(v)}
              >
                {v}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="sm:ml-auto"
            disabled={!shownOrders.length}
            onClick={() =>
              downloadCsv(
                shownOrders.map((o) => ({
                  Order: o.invoice_number,
                  Date: formatDateTime(o.invoice_date),
                  Customer: o.customer_name ?? "Walk-in",
                  Items: (o.invoice_items ?? []).map((i) => `${Number(i.quantity)} x ${i.product_name}`).join("; "),
                  Payment: o.payment_method,
                  Total: Number(o.grand_total),
                  Status: o.status,
                })),
                "orders.csv",
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Items ordered</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shownOrders.map((o) => {
                const lines = o.invoice_items ?? [];
                const qty = lines.reduce((s, i) => s + Number(i.quantity), 0);
                return (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <span className="block font-mono">{o.invoice_number}</span>
                      <span className="text-xs text-muted-foreground">{o.customer_name ?? "Walk-in"}</span>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(o.invoice_date)}</td>
                    <td className="min-w-64 px-3 py-2">
                      <ul className="space-y-0.5">
                        {lines.map((i) => (
                          <li key={i.id} className="flex justify-between gap-4">
                            <span>
                              <span className="font-mono text-muted-foreground">{formatNumber(Number(i.quantity))} ×</span>{" "}
                              {i.product_name}
                            </span>
                            <span className="font-mono text-muted-foreground">{money(i.line_total)}</span>
                          </li>
                        ))}
                        {!lines.length && <li className="text-muted-foreground">No items</li>}
                      </ul>
                      {lines.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lines.length} item{lines.length === 1 ? "" : "s"} · {formatNumber(qty)} in total
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize">{o.payment_method}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(o.grand_total)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"}>{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(o.id)}>
                        Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!shownOrders.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(false);
            setOpenId(null);
            setReturnQty({});
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Order {inv?.invoice_number ?? ""}
              {inv?.status === "cancelled" && (
                <Badge variant="destructive" className="ml-2 align-middle">
                  cancelled
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {inv && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {formatDateTime(inv.invoice_date)} · {inv.customer_name ?? "Walk-in"} · Cashier {inv.cashier_name}
              </p>
              {inv.status === "cancelled" && inv.cancel_reason && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                  Cancelled: {inv.cancel_reason}
                </p>
              )}

              {editing && inv.status === "completed" ? (
                <OrderEditor
                  invoice={inv}
                  items={detailItems}
                  payments={detailPays}
                  settings={settings}
                  onClose={() => setEditing(false)}
                  onSaved={() => setEditing(false)}
                />
              ) : (
                <>
              <div className="overflow-auto rounded-md border border-border">
                <table className="w-full">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">Item</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                      <th className="px-2 py-1 text-right">Rate</th>
                      <th className="px-2 py-1 text-right">Discount</th>
                      <th className="px-2 py-1 text-right">GST</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                      <th className="w-24 px-2 py-1">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((i) => {
                      const gst = Number(i.cgst) + Number(i.sgst) + Number(i.igst);
                      return (
                        <tr key={i.id} className="border-t border-border">
                          <td className="px-2 py-1">{i.product_name}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {formatNumber(Number(i.quantity))}
                            {Number(i.returned_qty) > 0 ? ` (−${formatNumber(Number(i.returned_qty))})` : ""}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{money(i.unit_price)}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {Number(i.discount) > 0 ? `−${money(i.discount)}` : "—"}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {money(gst)}
                            <span className="block text-[10px] text-muted-foreground">{Number(i.gst_rate)}%</span>
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{money(i.line_total)}</td>
                          <td className="px-2 py-1">
                            <Input
                              className="h-7"
                              type="number"
                              min="0"
                              max={Number(i.quantity) - Number(i.returned_qty)}
                              value={returnQty[i.id] ?? ""}
                              onChange={(e) =>
                                setReturnQty((prev) => ({ ...prev, [i.id]: Number(e.target.value) || 0 }))
                              }
                              disabled={inv.status === "cancelled"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Payment</p>
                  {detailPays.map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <span className="capitalize">{p.method}</span>
                      <span className="font-mono">{money(p.amount)}</span>
                    </div>
                  ))}
                  {!detailPays.length && <p className="text-muted-foreground">—</p>}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Bill summary · {formatNumber(itemCount)} items
                  </p>
                  <Row label="Subtotal" value={money(inv.subtotal)} />
                  {Number(inv.item_discount) > 0 && <Row label="Item discount" value={`−${money(inv.item_discount)}`} />}
                  {Number(inv.bill_discount) > 0 && <Row label="Bill discount" value={`−${money(inv.bill_discount)}`} />}
                  <Row label="Taxable value" value={money(inv.taxable_amount)} />
                  {Number(inv.cgst) > 0 && <Row label="CGST" value={money(inv.cgst)} />}
                  {Number(inv.sgst) > 0 && <Row label="SGST" value={money(inv.sgst)} />}
                  {Number(inv.igst) > 0 && <Row label="IGST" value={money(inv.igst)} />}
                  {Number(inv.round_off) !== 0 && <Row label="Round off" value={money(inv.round_off)} />}
                  <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
                    <span>Total</span>
                    <span className="font-mono">{money(inv.grand_total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={reprint}>
                  <Printer className="size-4" /> Reprint
                </Button>
                {me?.isManager && inv.status === "completed" && !detailItems.some((i) => Number(i.returned_qty) > 0) && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="size-4" /> Edit order
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={inv.status === "cancelled" || doReturn.isPending}
                  onClick={() => doReturn.mutate()}
                >
                  Record return
                </Button>
                {me?.isManager && inv.status !== "cancelled" && (
                  <Button variant="destructive" onClick={() => cancel.mutate(inv.id)}>
                    Cancel order
                  </Button>
                )}
              </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
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
