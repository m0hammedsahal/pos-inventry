import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { DateFilter } from "@/components/DateFilter";
import { Field } from "@/components/Field";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { endOfDay, formatCurrency, formatDate, formatNumber, isoDate, parseISODate, startOfDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Sales Reports — Malba Ree" },
      { name: "description", content: "Day-wise sales, top menu items, GST summary and profit with CSV export." },
      { property: "og:title", content: "Sales Reports — Malba Ree" },
      { property: "og:description", content: "Day-wise sales, top menu items, GST summary and profit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

function toCsv(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const body = rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SortKey = "qty" | "revenue";

function ReportsPage() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(isoDate(monthStart));
  const [to, setTo] = useState(isoDate(today));
  const [sortBy, setSortBy] = useState<SortKey>("qty");

  const range = {
    from: startOfDay(parseISODate(from)).toISOString(),
    to: endOfDay(parseISODate(to)).toISOString(),
  };

  // Completed orders in the range, each with its items.
  const { data: invoices = [] } = useQuery({
    queryKey: ["report-invoices", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .gte("invoice_date", range.from)
        .lte("invoice_date", range.to)
        .eq("status", "completed")
        .order("invoice_date");
      if (error) throw error;
      return data;
    },
  });

  const items = useMemo(() => invoices.flatMap((i) => i.invoice_items ?? []), [invoices]);

  const { data: expenses = [] } = useQuery({
    queryKey: ["report-expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  const summary = useMemo(() => {
    const sales = invoices.reduce((s, i) => s + Number(i.grand_total), 0);
    const cost = invoices.reduce((s, i) => s + Number(i.cost_total), 0);
    const tax = invoices.reduce((s, i) => s + Number(i.cgst) + Number(i.sgst) + Number(i.igst), 0);
    const exp = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { sales, cost, tax, exp, gross: sales - tax - cost, net: sales - tax - cost - exp };
  }, [invoices, expenses]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; bills: number; sales: number; tax: number }>();
    for (const i of invoices) {
      const key = isoDate(new Date(i.invoice_date));
      const row = map.get(key) ?? { date: key, bills: 0, sales: 0, tax: 0 };
      row.bills += 1;
      row.sales += Number(i.grand_total);
      row.tax += Number(i.cgst) + Number(i.sgst) + Number(i.igst);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices]);

  const gstSlabs = useMemo(() => {
    const map = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
    for (const it of items) {
      const rate = Number(it.gst_rate);
      const row = map.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      row.taxable += Number(it.taxable_amount);
      row.cgst += Number(it.cgst);
      row.sgst += Number(it.sgst);
      row.igst += Number(it.igst);
      map.set(rate, row);
    }
    return [...map.values()].sort((a, b) => a.rate - b.rate);
  }, [items]);

  // Top menu items: quantities and revenue net of anything returned.
  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items) {
      const sold = Number(it.quantity);
      const net = Math.max(0, sold - Number(it.returned_qty));
      if (net <= 0 || sold <= 0) continue;
      const row = map.get(it.product_name) ?? { name: it.product_name, qty: 0, revenue: 0 };
      row.qty += net;
      row.revenue += (Number(it.line_total) * net) / sold;
      map.set(it.product_name, row);
    }
    return [...map.values()].sort((a, b) => b[sortBy] - a[sortBy] || b.revenue - a.revenue).slice(0, 10);
  }, [items, sortBy]);

  const topMax = topItems.reduce((m, r) => Math.max(m, r[sortBy]), 0);
  const singleDay = from === to;

  return (
    <>
      <PageHeader title="Reports" description="Sales, top menu items and profit — for a single day or any date range." />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Day / date range">
            <DateFilter
              from={from}
              to={to}
              onChange={(a, b) => {
                setFrom(a);
                setTo(b);
              }}
            />
          </Field>
          <p className="pb-2 text-xs text-muted-foreground">
            {singleDay ? "Showing one day." : `Showing ${daily.length} day${daily.length === 1 ? "" : "s"} with sales.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Sales" value={formatCurrency(summary.sales, false)} />
          <Stat label="GST collected" value={formatCurrency(summary.tax, false)} />
          <Stat label="Gross profit" value={formatCurrency(summary.gross, false)} />
          <Stat label="Net profit" value={formatCurrency(summary.net, false)} />
        </div>

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div>
              <h2 className="text-sm font-semibold">Top Menu Items</h2>
              <p className="text-xs text-muted-foreground">
                Best sellers for {singleDay ? formatDate(parseISODate(from)) : "the selected dates"}, after returns.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-border p-0.5">
                <Button
                  size="sm"
                  variant={sortBy === "qty" ? "secondary" : "ghost"}
                  className="h-7"
                  onClick={() => setSortBy("qty")}
                >
                  By quantity
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === "revenue" ? "secondary" : "ghost"}
                  className="h-7"
                  onClick={() => setSortBy("revenue")}
                >
                  By revenue
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toCsv(
                    topItems.map((r, i) => ({
                      Rank: i + 1,
                      "Menu item": r.name,
                      "Qty sold": r.qty,
                      Revenue: Math.round(r.revenue * 100) / 100,
                    })),
                    "top-menu-items.csv",
                  )
                }
              >
                <Download className="size-4" /> Export CSV
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border">
            {topItems.map((r, i) => (
              <div key={r.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatNumber(r.qty)} sold · {formatCurrency(r.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${topMax > 0 ? Math.max(3, (r[sortBy] / topMax) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {!topItems.length && (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">No menu items sold in this period.</p>
            )}
          </div>
        </Card>

        <Tabs defaultValue="daily">
          <TabsList className="mb-3">
            <TabsTrigger value="daily">Day-wise sales</TabsTrigger>
            <TabsTrigger value="gst">GST summary</TabsTrigger>
          </TabsList>

          <TabsContent value="daily">
            <ReportTable
              onExport={() =>
                toCsv(
                  daily.map((d) => ({ Date: d.date, Orders: d.bills, Sales: d.sales, GST: d.tax })),
                  "daily-sales.csv",
                )
              }
              head={["Date", "Orders", "Sales", "GST"]}
              rows={daily.map((d) => [
                formatDate(parseISODate(d.date)),
                String(d.bills),
                formatCurrency(d.sales),
                formatCurrency(d.tax),
              ])}
              onRowClick={(index) => {
                const day = daily[index]?.date;
                if (day) {
                  setFrom(day);
                  setTo(day);
                }
              }}
              hint="Click a day to filter the whole report to it."
            />
          </TabsContent>

          <TabsContent value="gst">
            <ReportTable
              onExport={() =>
                toCsv(
                  gstSlabs.map((g) => ({
                    "GST rate": g.rate,
                    "Taxable value": g.taxable,
                    CGST: g.cgst,
                    SGST: g.sgst,
                    IGST: g.igst,
                  })),
                  "gst-summary.csv",
                )
              }
              head={["GST rate", "Taxable value", "CGST", "SGST", "IGST"]}
              rows={gstSlabs.map((g) => [
                `${g.rate}%`,
                formatCurrency(g.taxable),
                formatCurrency(g.cgst),
                formatCurrency(g.sgst),
                formatCurrency(g.igst),
              ])}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function ReportTable({
  head,
  rows,
  onExport,
  onRowClick,
  hint,
}: {
  head: string[];
  rows: string[][];
  onExport: () => void;
  onRowClick?: (index: number) => void;
  hint?: string;
}) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border p-2">
        <p className="px-1 text-xs text-muted-foreground">{hint ?? ""}</p>
        <Button size="sm" variant="outline" onClick={onExport}>
          <Download className="size-4" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={"border-t border-border " + (onRowClick ? "cursor-pointer hover:bg-accent/40" : "")}
                onClick={onRowClick ? () => onRowClick(i) : undefined}
              >
                {r.map((c, j) => (
                  <td key={j} className={"px-3 py-2 " + (j > 0 ? "font-mono" : "")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={head.length} className="px-3 py-10 text-center text-muted-foreground">
                  No data for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
