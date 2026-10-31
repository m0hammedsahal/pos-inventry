import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { PageHeader } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { KITCHEN_UNITS } from "@/lib/cafe";
import { downloadCsv } from "@/lib/csv";
import type { KitchenItem } from "@/types";

/**
 * KITCHEN STOCK — raw materials only (milk, flour, coffee beans, …).
 * Finished dishes and drinks live in the Menu (/products) and have no stock here.
 */
export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Kitchen Stock — Malba Ree" },
      { name: "description", content: "Track raw materials: add and remove products, stock in, stock out and low-stock alerts." },
      { property: "og:title", content: "Kitchen Stock — Malba Ree" },
      { property: "og:description", content: "Track raw materials and low-stock alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KitchenStockPage,
});

const emptyAdd = { name: "", unit: "kg", opening: "", min: "", cost: "" };

type AdjustMode = "in" | "out";

function KitchenStockPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const canEdit = me?.isManager ?? false;

  const [term, setTerm] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyAdd });
  const [adjust, setAdjust] = useState<{ item: KitchenItem; mode: AdjustMode } | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [removing, setRemoving] = useState<KitchenItem | null>(null);

  const { data: items = [] } = useQuery({
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

  const { data: movements = [] } = useQuery({
    queryKey: ["kitchen-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kitchen_stock_movements")
        .select("*, kitchen_items(name, unit)")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["kitchen-items"] });
    void queryClient.invalidateQueries({ queryKey: ["kitchen-movements"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("kitchen_add_item", {
        _name: addForm.name,
        _unit: addForm.unit,
        _opening: Number(addForm.opening) || 0,
        _min: Number(addForm.min) || 0,
        _cost: Number(addForm.cost) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${addForm.name.trim()} added to Kitchen Stock`);
      setAddOpen(false);
      setAddForm({ ...emptyAdd });
      refresh();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const adjustStock = useMutation({
    mutationFn: async () => {
      if (!adjust) return;
      const qty = Number(adjustQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a quantity greater than zero");
      const { error } = await supabase.rpc("kitchen_stock_adjust", {
        _item_id: adjust.item.id,
        _delta: adjust.mode === "in" ? qty : -qty,
        _type: adjust.mode === "in" ? "stock_in" : "stock_out",
        _reason: adjustReason.trim() || (adjust.mode === "in" ? "Stock added" : "Stock used"),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(adjust?.mode === "in" ? "Stock added" : "Stock removed");
      setAdjust(null);
      setAdjustQty("");
      setAdjustReason("");
      refresh();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("kitchen_remove_item", { _item_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product removed from Kitchen Stock");
      setRemoving(null);
      refresh();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const filtered = items.filter(
    (p) =>
      (term.trim() ? p.name.toLowerCase().includes(term.trim().toLowerCase()) : true) &&
      (!lowOnly || Number(p.current_stock) <= Number(p.min_stock)),
  );
  const stockValue = items.reduce((s, p) => s + Number(p.current_stock) * Number(p.cost_price), 0);
  const lowCount = items.filter((p) => Number(p.current_stock) <= Number(p.min_stock)).length;

  function openAdjust(item: KitchenItem, mode: AdjustMode) {
    setAdjust({ item, mode });
    setAdjustQty("");
    setAdjustReason("");
  }

  return (
    <>
      <PageHeader
        title="Kitchen Stock"
        description={`Raw materials only · ${items.length} products · stock value ${formatCurrency(stockValue, false)}${
          lowCount ? ` · ${lowCount} low` : ""
        }`}
        actions={
          canEdit ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add Product
            </Button>
          ) : null
        }
      />
      <div className="p-4">
        <Tabs defaultValue="stock">
          <TabsList className="mb-3">
            <TabsTrigger value="stock">Stock levels</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-full sm:w-72"
                placeholder="Search raw material"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              <Button variant={lowOnly ? "secondary" : "outline"} size="sm" onClick={() => setLowOnly((v) => !v)}>
                Low stock only{lowCount ? ` (${lowCount})` : ""}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="sm:ml-auto"
                disabled={!items.length}
                onClick={() =>
                  downloadCsv(
                    items.map((p) => ({
                      Product: p.name,
                      Unit: p.unit,
                      "In stock": Number(p.current_stock),
                      "Alert at": Number(p.min_stock),
                      "Cost per unit": Number(p.cost_price),
                      Value: Math.round(Number(p.current_stock) * Number(p.cost_price) * 100) / 100,
                    })),
                    "kitchen-stock.csv",
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
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">In stock</th>
                    <th className="px-3 py-2 text-right">Alert at</th>
                    <th className="px-3 py-2 text-right">Cost / unit</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2">Status</th>
                    {canEdit && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const low = Number(p.current_stock) <= Number(p.min_stock);
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatNumber(Number(p.current_stock))} {p.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(Number(p.min_stock))}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {Number(p.cost_price) ? formatCurrency(Number(p.cost_price)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCurrency(Number(p.current_stock) * Number(p.cost_price))}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={low ? "destructive" : "secondary"}>{low ? "Low" : "OK"}</Badge>
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => openAdjust(p, "in")}>
                                <ArrowDownToLine className="size-4" /> In
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openAdjust(p, "out")}>
                                <ArrowUpFromLine className="size-4" /> Out
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRemoving(p)}
                              >
                                <Trash2 className="size-4" /> Remove Product
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">
                        {items.length ? "No raw material matches your search." : "No raw materials yet. Use Add Product to start."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="movements">
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-3 py-2">{formatDateTime(m.created_at)}</td>
                      <td className="px-3 py-2">{m.kitchen_items?.name ?? "-"}</td>
                      <td className="px-3 py-2 capitalize">{m.type.replace("_", " ")}</td>
                      <td
                        className={
                          "px-3 py-2 text-right font-mono " +
                          (Number(m.quantity) < 0 ? "text-destructive" : "text-success")
                        }
                      >
                        {Number(m.quantity) > 0 ? "+" : ""}
                        {formatNumber(Number(m.quantity))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(Number(m.balance_after ?? 0))}</td>
                      <td className="px-3 py-2 text-muted-foreground">{m.reason ?? "-"}</td>
                    </tr>
                  ))}
                  {!movements.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        No stock movements yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Product */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Add a raw material to Kitchen Stock, e.g. milk, flour, coffee beans.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Product name">
                <Input
                  value={addForm.name}
                  placeholder="e.g. Milk"
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Unit">
              <Select value={addForm.unit} onValueChange={(v) => setAddForm({ ...addForm, unit: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KITCHEN_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Opening quantity">
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={addForm.opening}
                onChange={(e) => setAddForm({ ...addForm, opening: e.target.value })}
              />
            </Field>
            <Field label="Low-stock alert at">
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={addForm.min}
                onChange={(e) => setAddForm({ ...addForm, min: e.target.value })}
              />
            </Field>
            <Field label="Cost per unit (₹, optional)">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={addForm.cost}
                onChange={(e) => setAddForm({ ...addForm, cost: e.target.value })}
              />
            </Field>
          </div>
          <Button
            className="w-full"
            disabled={!addForm.name.trim() || addItem.isPending}
            onClick={() => addItem.mutate()}
          >
            Add Product
          </Button>
        </DialogContent>
      </Dialog>

      {/* Stock in / out */}
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {adjust?.mode === "in" ? "Stock in" : "Stock out"} — {adjust?.item.name}
            </DialogTitle>
            <DialogDescription>
              Currently {formatNumber(Number(adjust?.item.current_stock ?? 0))} {adjust?.item.unit}.
            </DialogDescription>
          </DialogHeader>
          <Field label={`Quantity (${adjust?.item.unit ?? ""})`}>
            <Input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              autoFocus
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
            />
          </Field>
          <Field label={adjust?.mode === "in" ? "Note (optional)" : "Reason (used, wasted, expired…)"}>
            <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </Field>
          <Button className="w-full" disabled={!adjustQty || adjustStock.isPending} onClick={() => adjustStock.mutate()}>
            {adjust?.mode === "in" ? "Add stock" : "Remove stock"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Remove Product */}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This takes the product out of Kitchen Stock
              {removing && Number(removing.current_stock) > 0
                ? ` (${formatNumber(Number(removing.current_stock))} ${removing.unit} still counted in stock)`
                : ""}
              . Its past movements stay in the history, and you can add it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeItem.isPending}
              onClick={() => removing && removeItem.mutate(removing.id)}
            >
              Remove Product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
