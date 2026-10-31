import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, isoDate } from "@/lib/format";
import { addMoney, mulMoney, percentOf } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Malba Ree" },
      { name: "description", content: "Record supplier purchases of raw materials and add them to Kitchen Stock." },
      { property: "og:title", content: "Purchases — Malba Ree" },
      { property: "og:description", content: "Record supplier purchases and add raw materials to Kitchen Stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchasesPage,
});

interface Line {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  gstRate: number;
}

function PurchasesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(isoDate(new Date()));
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .order("purchase_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ["kitchen-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kitchen_items")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const subtotal = addMoney(...lines.map((l) => mulMoney(l.purchasePrice, l.quantity)), 0);
  const tax = addMoney(...lines.map((l) => percentOf(mulMoney(l.purchasePrice, l.quantity), l.gstRate)), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("Add at least one item");
      if (lines.some((l) => !(l.quantity > 0))) throw new Error("Every item needs a quantity above zero");
      const supplier = suppliers.find((s) => s.id === supplierId);
      const { error } = await supabase.rpc("create_purchase", {
        payload: {
          supplierId: supplierId || null,
          supplierName: supplier?.name ?? null,
          invoiceNumber,
          purchaseDate: new Date(purchaseDate).toISOString(),
          items: lines.map((l) => ({
            itemId: l.itemId,
            itemName: l.itemName,
            quantity: l.quantity,
            purchasePrice: l.purchasePrice,
            gstRate: l.gstRate,
          })),
        } as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase recorded and Kitchen Stock updated");
      setOpen(false);
      setLines([]);
      setInvoiceNumber("");
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  function addLine(itemId: string) {
    const p = rawMaterials.find((x) => x.id === itemId);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.itemId === p.id)
        ? prev
        : [
            ...prev,
            {
              itemId: p.id,
              itemName: p.name,
              unit: p.unit,
              quantity: 1,
              purchasePrice: Number(p.cost_price),
              gstRate: 0,
            },
          ],
    );
    setPick("");
  }

  const patch = (i: number, change: Partial<Line>) =>
    setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...change } : x)));

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Raw materials bought from suppliers — each purchase adds to Kitchen Stock."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New purchase
          </Button>
        }
      />
      <div className="p-4">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Bill no.</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">{formatDate(p.purchase_date)}</td>
                  <td className="px-3 py-2">{p.supplier_name ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.invoice_number ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(p.subtotal))}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(p.tax_total))}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(p.grand_total))}</td>
                </tr>
              ))}
              {!purchases.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    No purchases recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>New purchase</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Supplier">
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Supplier bill no.">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>
            <Field label="Date">
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Add raw material">
            <Select value={pick} onValueChange={addLine}>
              <SelectTrigger>
                <SelectValue placeholder={rawMaterials.length ? "Choose from Kitchen Stock" : "No raw materials yet"} />
              </SelectTrigger>
              <SelectContent>
                {rawMaterials.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!rawMaterials.length && (
            <p className="text-xs text-muted-foreground">Add raw materials in Kitchen Stock first (Add Product).</p>
          )}

          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Item</th>
                  <th className="w-24 px-2 py-1">Qty</th>
                  <th className="w-28 px-2 py-1">Cost / unit</th>
                  <th className="w-20 px-2 py-1">GST %</th>
                  <th className="px-2 py-1 text-right">Total</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.itemId} className="border-t border-border">
                    <td className="px-2 py-1">
                      {l.itemName} <span className="text-xs text-muted-foreground">({l.unit})</span>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8"
                        type="number"
                        min="0"
                        step="any"
                        value={l.quantity}
                        onChange={(e) => patch(i, { quantity: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8"
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.purchasePrice}
                        onChange={(e) => patch(i, { purchasePrice: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8"
                        type="number"
                        min="0"
                        value={l.gstRate}
                        onChange={(e) => patch(i, { gstRate: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {formatCurrency(mulMoney(l.purchasePrice, l.quantity))}
                    </td>
                    <td className="px-2 py-1">
                      <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                      No items added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span>
              Subtotal {formatCurrency(subtotal)} · Tax {formatCurrency(tax)}
            </span>
            <span className="text-lg font-semibold">{formatCurrency(addMoney(subtotal, tax))}</span>
          </div>

          <Button className="w-full" disabled={!lines.length || save.isPending} onClick={() => save.mutate()}>
            Save purchase
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
