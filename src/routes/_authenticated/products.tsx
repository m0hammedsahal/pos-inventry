import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { PageHeader } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { GST_RATES } from "@/lib/tax";
import { MENU_UNITS, generateItemCode } from "@/lib/cafe";
import type { Product } from "@/types";

/**
 * MENU — finished dishes and drinks that are sold at the counter.
 * Raw materials and their quantities live in Kitchen Stock (/inventory).
 */
export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Menu — Malba Ree" },
      { name: "description", content: "Manage the cafe menu: dishes and drinks with their prices and GST." },
      { property: "og:title", content: "Menu — Malba Ree" },
      { property: "og:description", content: "Manage dishes and drinks with prices and GST." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

const NO_CATEGORY = "none";

const emptyForm = {
  name: "",
  code: "",
  category_id: NO_CATEGORY,
  unit: "plate",
  gst_rate: "5",
  hsn_code: "",
  selling_price: "",
  cost_price: "",
  is_active: true,
};

function MenuPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const [term, setTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [catsOpen, setCatsOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: items = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  const save = useMutation({
    mutationFn: async () => {
      const price = Number(form.selling_price);
      if (!form.name.trim()) throw new Error("Enter the item name");
      if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid selling price");
      const cost = Number(form.cost_price) || 0;

      const row = {
        name: form.name.trim(),
        sku: form.code.trim() || editing?.sku || generateItemCode(),
        category_id: form.category_id === NO_CATEGORY ? null : form.category_id,
        unit: form.unit,
        gst_rate: Number(form.gst_rate) || 0,
        hsn_code: form.hsn_code.trim() || null,
        selling_price: price,
        mrp: price,
        purchase_price: cost,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(row).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Menu item updated" : "Menu item added");
      setOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Another menu item already uses that item code" : e.message),
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      const name = newCategory.trim().replace(/\s+/g, " ");
      if (!name) throw new Error("Enter a category name");
      if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" already exists`);
      const { error } = await supabase.from("categories").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setNewCategory("");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-categories"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      // only ever delete a category that has no menu items
      const { count, error: countError } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id);
      if (countError) throw countError;
      if ((count ?? 0) > 0) throw new Error("This category still has menu items. Move or delete them first.");
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category removed");
      setCategoryFilter("all");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-categories"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const itemCountByCategory = new Map<string, number>();
  for (const p of items) if (p.category_id) itemCountByCategory.set(p.category_id, (itemCountByCategory.get(p.category_id) ?? 0) + 1);
  const emptyCategories = categories.filter((c) => !itemCountByCategory.get(c.id));

  const toggleAvailable = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("products").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries(),
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const filtered = items.filter((p) => {
    if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || categoryName(p.category_id).toLowerCase().includes(q);
  });

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function edit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.sku,
      category_id: p.category_id ?? NO_CATEGORY,
      unit: p.unit,
      gst_rate: String(Number(p.gst_rate)),
      hsn_code: p.hsn_code ?? "",
      selling_price: String(Number(p.selling_price)),
      cost_price: Number(p.purchase_price) ? String(Number(p.purchase_price)) : "",
      is_active: p.is_active,
    });
    setOpen(true);
  }

  const available = items.filter((p) => p.is_active).length;

  return (
    <>
      <PageHeader
        title="Menu"
        description={`${items.length} dishes & drinks · ${available} available at the counter.`}
        actions={
          me?.isManager ? (
            <>
              <Button variant="outline" onClick={() => setCatsOpen(true)}>
                <Tags className="size-4" /> Categories
              </Button>
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add menu item
              </Button>
            </>
          ) : null
        }
      />
      <div className="space-y-3 p-4">
        <Input
          className="w-full sm:max-w-sm"
          placeholder="Search dish, drink or category"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: "all", name: "All" }, ...categories].map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={categoryFilter === c.id ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">GST</th>
                <th className="px-3 py-2 text-right">Cost / serving</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Counter</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{p.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </td>
                  <td className="px-3 py-2">{categoryName(p.category_id)}</td>
                  <td className="px-3 py-2">{Number(p.gst_rate)}%</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {Number(p.purchase_price) ? formatCurrency(Number(p.purchase_price)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(p.selling_price))}</td>
                  <td className="px-3 py-2">
                    {me?.isManager ? (
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={p.is_active}
                          disabled={toggleAvailable.isPending}
                          onCheckedChange={(v) => toggleAvailable.mutate({ id: p.id, is_active: v })}
                        />
                        {p.is_active ? "Available" : "Hidden"}
                      </label>
                    ) : (
                      <Badge variant={p.is_active ? "secondary" : "outline"}>
                        {p.is_active ? "Available" : "Hidden"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {me?.isManager && (
                      <Button size="sm" variant="outline" onClick={() => edit(p)}>
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No menu items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-muted-foreground">
          Menu items have no stock count — raw materials such as milk, flour or coffee beans are tracked in Kitchen
          Stock.
        </p>
      </div>

      <Dialog open={catsOpen} onOpenChange={setCatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Menu categories</DialogTitle>
            <DialogDescription>Add categories, or delete the ones that have no items.</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCategory.trim() && !addCategory.isPending) addCategory.mutate();
            }}
          >
            <Input value={newCategory} placeholder="New category name" onChange={(e) => setNewCategory(e.target.value)} />
            <Button type="submit" disabled={!newCategory.trim() || addCategory.isPending}>
              <Plus className="size-4" /> Add
            </Button>
          </form>
          <div className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">
            {categories.map((c) => {
              const n = itemCountByCategory.get(c.id) ?? 0;
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {c.name} <span className="text-xs text-muted-foreground">· {n} item{n === 1 ? "" : "s"}</span>
                  </span>
                  {n === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteCategory.isPending}
                      onClick={() => deleteCategory.mutate(c.id)}
                    >
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  )}
                </div>
              );
            })}
            {!categories.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No categories yet.</p>}
          </div>
          {emptyCategories.length > 1 && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleteCategory.isPending}
              onClick={async () => {
                for (const c of emptyCategories) await deleteCategory.mutateAsync(c.id).catch(() => undefined);
              }}
            >
              <Trash2 className="size-4" /> Delete all {emptyCategories.length} empty categories
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit menu item" : "Add menu item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Name">
                <Input
                  value={form.name}
                  placeholder="e.g. Cold Coffee, Veg Burger"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Category">
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sold as">
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set<string>([...MENU_UNITS, form.unit])].map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Selling price (₹)">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
              />
            </Field>
            <Field label="GST rate">
              <Select value={form.gst_rate} onValueChange={(v) => setForm({ ...form, gst_rate: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cost per serving (₹, optional)">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              />
            </Field>
            <Field label="HSN code (optional)">
              <Input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} />
            </Field>
            <Field label="Item code (optional)">
              <Input
                value={form.code}
                placeholder="Auto-generated if empty"
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              Available at the counter
            </label>
          </div>
          <Button className="w-full" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {editing ? "Save changes" : "Add to menu"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
