import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Download, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CancelExpenseDialog, type CancellableExpense } from "@/components/expenses/CancelExpenseDialog";
import { Field } from "@/components/Field";
import { addMoney, money, subMoney } from "@/lib/money";
import { formatCurrency, formatDate, isoDate, parseISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/daybook")({
  head: () => ({
    meta: [
      { title: "Day Book — Cafe Cash & Sales Register" },
      {
        name: "description",
        content:
          "Daily cafe cash register: opening balance, counter sales, extra night sales, expenses and closing balance.",
      },
      { property: "og:title", content: "Day Book — Cafe Cash & Sales Register" },
      {
        property: "og:description",
        content: "Opening balance carried forward daily, night sales entry and expenses deducted automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DayBookPage,
});

type DayRow = {
  business_date: string;
  opening_balance: number;
  opening_locked: boolean;
  extra_cash_sales: number;
  extra_upi_sales: number;
  extra_card_sales: number;
  extra_note: string | null;
  bill_sales: number;
  expenses_total: number;
  closing_balance: number;
  is_closed: boolean;
};

function toCsv(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const body = rows.map((r) => headers.map((h) => `"${String(r[h] ?? "")}"`).join(","));
  const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DayBookPage() {
  const { data: me } = useMyProfile();
  const canEdit = me?.isManager ?? false;
  const queryClient = useQueryClient();

  const today = isoDate(new Date());
  const monthStart = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [date, setDate] = useState(today);

  const { data: days = [], isLoading } = useQuery({
    queryKey: ["day-books", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_books")
        .select("*")
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false });
      if (error) throw error;
      return data as unknown as DayRow[];
    },
  });

  const { data: anyDay } = useQuery({
    queryKey: ["day-books-first"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_books")
        .select("business_date")
        .order("business_date")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: selected } = useQuery({
    queryKey: ["day-book", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("day_books").select("*").eq("business_date", date).maybeSingle();
      if (error) throw error;
      return (data as unknown as DayRow | null) ?? null;
    },
  });

  const { data: live } = useQuery({
    queryKey: ["day-book-live", date],
    queryFn: async () => {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      const [bills, exp] = await Promise.all([
        supabase
          .from("invoices")
          .select("grand_total, payment_method")
          .eq("status", "completed")
          .gte("invoice_date", start.toISOString())
          .lte("invoice_date", end.toISOString()),
        supabase.from("expenses").select("amount, payment_method").eq("expense_date", date).neq("status", "cancelled"),
      ]);
      return {
        billSales: (bills.data ?? []).reduce((s, b) => addMoney(s, Number(b.grand_total)), 0),
        expenses: (exp.data ?? []).reduce((s, e) => addMoney(s, Number(e.amount)), 0),
        billCount: (bills.data ?? []).length,
      };
    },
  });

  const { data: dayExpenses = [] } = useQuery({
    queryKey: ["day-book-expenses", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("expense_date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [cancelling, setCancelling] = useState<CancellableExpense | null>(null);

  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [card, setCard] = useState("");
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState("");

  useEffect(() => {
    setCash(selected?.extra_cash_sales ? String(Number(selected.extra_cash_sales)) : "");
    setUpi(selected?.extra_upi_sales ? String(Number(selected.extra_upi_sales)) : "");
    setCard(selected?.extra_card_sales ? String(Number(selected.extra_card_sales)) : "");
    setNote(selected?.extra_note ?? "");
    setOpening(selected ? String(Number(selected.opening_balance)) : "");
  }, [selected, date]);

  const extraTotal = addMoney(Number(cash) || 0, Number(upi) || 0, Number(card) || 0);
  const billSales = live?.billSales ?? Number(selected?.bill_sales ?? 0);
  const expenses = live?.expenses ?? Number(selected?.expenses_total ?? 0);
  const openingValue = selected ? Number(selected.opening_balance) : Number(opening) || 0;
  const closing = subMoney(addMoney(openingValue, billSales, extraTotal), expenses);

  const isFirstEver = !anyDay;

  const save = useMutation({
    mutationFn: async (args: { close: boolean; setOpening: boolean }) => {
      const { error } = await supabase.rpc("save_day_book", {
        _date: date,
        _extra_cash: money(Number(cash) || 0),
        _extra_upi: money(Number(upi) || 0),
        _extra_card: money(Number(card) || 0),
        _note: note || null,
        _opening: args.setOpening ? money(Number(opening) || 0) : null,
        _close: args.close,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      toast.success(args.close ? "Day closed. Balance carried to tomorrow." : "Day book saved.");
      queryClient.invalidateQueries({ queryKey: ["day-books"] });
      queryClient.invalidateQueries({ queryKey: ["day-book", date] });
      queryClient.invalidateQueries({ queryKey: ["day-books-first"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const totals = useMemo(
    () => ({
      sales: days.reduce(
        (s, d) =>
          addMoney(
            s,
            Number(d.bill_sales),
            Number(d.extra_cash_sales),
            Number(d.extra_upi_sales),
            Number(d.extra_card_sales),
          ),
        0,
      ),
      expenses: days.reduce((s, d) => addMoney(s, Number(d.expenses_total)), 0),
    }),
    [days],
  );

  return (
    <>
      <PageHeader
        title="Day Book"
        description="Opening balance, counter sales, night entries and expenses — closing balance carries to the next day."
      />
      <div className="space-y-4 p-4">
        {isFirstEver && (
          <Card className="border-primary/40 bg-primary/5 p-4">
            <h2 className="text-sm font-semibold">Start your day book</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the cash you have in hand today. After this, every day opens with the previous day&apos;s closing
              balance automatically.
            </p>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Day">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Opening balance">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={opening}
                disabled={!canEdit}
                onChange={(e) => setOpening(e.target.value)}
              />
            </Field>
            <p className="pb-2 text-xs text-muted-foreground">
              {selected?.opening_locked
                ? "Set by hand for this day."
                : selected
                  ? "Carried forward from the previous day."
                  : "Will carry forward automatically once saved."}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Extra sales — cash">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={cash}
                disabled={!canEdit}
                onChange={(e) => setCash(e.target.value)}
              />
            </Field>
            <Field label="Extra sales — UPI">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={upi}
                disabled={!canEdit}
                onChange={(e) => setUpi(e.target.value)}
              />
            </Field>
            <Field label="Extra sales — card">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={card}
                disabled={!canEdit}
                onChange={(e) => setCard(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Note (what these extra sales were)">
              <Textarea
                rows={2}
                value={note}
                disabled={!canEdit}
                placeholder="e.g. late night juice counter, party order not billed"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Line label="Opening" value={formatCurrency(openingValue, false)} />
            <Line label={`Billed sales (${live?.billCount ?? 0})`} value={formatCurrency(billSales, false)} />
            <Line label="Extra sales" value={formatCurrency(extraTotal, false)} />
            <Line label="Expenses" value={"− " + formatCurrency(expenses, false)} tone="bad" />
            <Line label="Closing balance" value={formatCurrency(closing, false)} tone="good" />
          </div>

          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => save.mutate({ close: false, setOpening: !selected || selected.opening_locked || isFirstEver })}
                disabled={save.isPending}
              >
                <Save className="size-4" /> Save day
              </Button>
              <Button
                variant="outline"
                onClick={() => save.mutate({ close: true, setOpening: !selected || isFirstEver })}
                disabled={save.isPending}
              >
                <Lock className="size-4" /> Save & close day
              </Button>
              {selected?.is_closed && <span className="self-center text-xs text-muted-foreground">Day closed</span>}
            </div>
          )}
          {!canEdit && (
            <p className="mt-4 text-xs text-muted-foreground">
              Only a manager or owner can enter day book figures.
            </p>
          )}
        </Card>

        <Card className="p-0">
          <div className="border-b border-border p-3">
            <h2 className="text-sm font-semibold">Expenses on {formatDate(parseISODate(date))}</h2>
            <p className="text-xs text-muted-foreground">
              Cancel a wrong entry and it stops counting in today&apos;s closing balance.
            </p>
          </div>
          <div className="divide-y divide-border text-sm">
            {dayExpenses.map((e) => {
              const cancelled = e.status === "cancelled";
              return (
                <div
                  key={e.id}
                  className={"flex items-center justify-between gap-3 px-3 py-2 " + (cancelled ? "text-muted-foreground" : "")}
                >
                  <div className="min-w-0">
                    <p className={"truncate font-medium " + (cancelled ? "line-through" : "")}>{e.title}</p>
                    <p className="text-xs capitalize">
                      {e.category} · {e.payment_method}
                      {cancelled ? ` · cancelled${e.cancel_reason ? ` — ${e.cancel_reason}` : ""}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={"font-mono " + (cancelled ? "line-through" : "")}>
                      {formatCurrency(Number(e.amount))}
                    </span>
                    {cancelled ? (
                      <Badge variant="outline">Cancelled</Badge>
                    ) : (
                      canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCancelling(e)}
                        >
                          Cancel
                        </Button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {!dayExpenses.length && <p className="px-3 py-6 text-center text-muted-foreground">No expenses on this day.</p>}
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <p className="pb-2 text-xs text-muted-foreground">
                Sales {formatCurrency(totals.sales, false)} · Expenses {formatCurrency(totals.expenses, false)}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toCsv(
                  days.map((d) => ({
                    Date: formatDate(d.business_date),
                    Opening: Number(d.opening_balance),
                    "Billed sales": Number(d.bill_sales),
                    "Extra cash": Number(d.extra_cash_sales),
                    "Extra UPI": Number(d.extra_upi_sales),
                    "Extra card": Number(d.extra_card_sales),
                    Expenses: Number(d.expenses_total),
                    Closing: Number(d.closing_balance),
                    Note: d.extra_note ?? "",
                  })),
                  "day-book.csv",
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {["Date", "Opening", "Billed", "Extra", "Expenses", "Closing", ""].map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr
                    key={d.business_date}
                    className="cursor-pointer border-t border-border hover:bg-accent/40"
                    onClick={() => setDate(d.business_date)}
                  >
                    <td className="px-3 py-2">{formatDate(d.business_date)}</td>
                    <td className="px-3 py-2 font-mono">{formatCurrency(Number(d.opening_balance))}</td>
                    <td className="px-3 py-2 font-mono">{formatCurrency(Number(d.bill_sales))}</td>
                    <td className="px-3 py-2 font-mono">
                      {formatCurrency(
                        addMoney(
                          Number(d.extra_cash_sales),
                          Number(d.extra_upi_sales),
                          Number(d.extra_card_sales),
                        ),
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-destructive">
                      {formatCurrency(Number(d.expenses_total))}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {formatCurrency(Number(d.closing_balance))}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.is_closed ? "Closed" : "Open"}</td>
                  </tr>
                ))}
                {!days.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No days recorded in this period yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <CancelExpenseDialog expense={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          "mt-1 font-mono text-lg font-semibold " +
          (tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
