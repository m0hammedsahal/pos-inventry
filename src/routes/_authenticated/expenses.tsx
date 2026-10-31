import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { CancelExpenseDialog, type CancellableExpense } from "@/components/expenses/CancelExpenseDialog";
import { ExpenseCategoryDialog } from "@/components/expenses/ExpenseCategoryDialog";
import { useExpenseCategories } from "@/components/expenses/useExpenseCategories";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, isoDate, parseISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — Malba Ree" },
      { name: "description", content: "Record cafe expenses by category, cancel wrong entries and add your own categories." },
      { property: "og:title", content: "Expenses — Malba Ree" },
      { property: "og:description", content: "Record expenses, cancel entries and create custom categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensesPage,
});

const NEW_CATEGORY = "__new__";

const emptyForm = () => ({
  title: "",
  category: "other",
  amount: "",
  expense_date: isoDate(new Date()),
  payment_method: "cash",
  description: "",
});

function ExpensesPage() {
  const queryClient = useQueryClient();
  const { options: categories } = useExpenseCategories();
  const [open, setOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [cancelling, setCancelling] = useState<CancellableExpense | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.title.trim()) throw new Error("Enter a title");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero");
      const { error } = await supabase.from("expenses").insert({
        title: form.title.trim(),
        category: form.category,
        amount,
        expense_date: form.expense_date,
        payment_method: form.payment_method,
        description: form.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense recorded");
      setOpen(false);
      setForm({ ...emptyForm(), category: form.category, expense_date: form.expense_date });
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const active = expenses.filter((e) => e.status !== "cancelled");
  const cancelledCount = expenses.length - active.length;
  const total = active.reduce((s, e) => s + Number(e.amount), 0);

  // make sure the saved value is always one of the options (e.g. a deleted custom category)
  const categoryValues = categories.some((c) => c.name === form.category)
    ? categories.map((c) => c.name)
    : [...categories.map((c) => c.name), form.category];

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${formatCurrency(total, false)} across ${active.length} entries${
          cancelledCount ? ` · ${cancelledCount} cancelled` : ""
        }.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Tags className="size-4" /> Categories
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New expense
            </Button>
          </>
        }
      />
      <div className="p-4">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Paid via</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const cancelled = e.status === "cancelled";
                return (
                  <tr key={e.id} className={"border-t border-border " + (cancelled ? "text-muted-foreground" : "")}>
                    <td className="px-3 py-2">{formatDate(parseISODate(e.expense_date))}</td>
                    <td className="px-3 py-2">
                      <span className={"font-medium " + (cancelled ? "line-through" : "")}>{e.title}</span>
                      {cancelled && (
                        <span className="mt-0.5 block text-xs">
                          Cancelled{e.cancel_reason ? ` — ${e.cancel_reason}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize">{e.category}</td>
                    <td className="px-3 py-2 capitalize">{e.payment_method}</td>
                    <td className={"px-3 py-2 text-right font-mono " + (cancelled ? "line-through" : "")}>
                      {formatCurrency(Number(e.amount))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {cancelled ? (
                        <Badge variant="outline">Cancelled</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCancelling(e)}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!expenses.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    No expenses recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Amount (₹)">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(v) => {
                  if (v === NEW_CATEGORY) setCategoriesOpen(true);
                  else setForm({ ...form, category: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryValues.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={NEW_CATEGORY}>＋ New category…</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Paid via">
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["cash", "upi", "card", "bank"].map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.expense_date}
                max={isoDate(new Date())}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </Field>
            <Field label="Note">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <Button
            className="w-full"
            disabled={!form.title.trim() || !(Number(form.amount) > 0) || save.isPending}
            onClick={() => save.mutate()}
          >
            Save expense
          </Button>
        </DialogContent>
      </Dialog>

      <ExpenseCategoryDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        onCreated={(name) => setForm((f) => ({ ...f, category: name }))}
      />
      <CancelExpenseDialog expense={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </>
  );
}
