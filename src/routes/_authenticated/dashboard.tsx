import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/AppShell";
import { useMyProfile } from "@/hooks/useAuthUser";
import { CalendarCheck, ChefHat, Plus, ShoppingCart, UtensilsCrossed, Wallet } from "lucide-react";
import { formatCurrency, formatNumber, isoDate, startOfDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Malba Ree" },
      { name: "description", content: "Today's sales, profit, low kitchen stock and dues at a glance." },
      { property: "og:title", content: "Dashboard — Malba Ree" },
      { property: "og:description", content: "Today's sales, profit, low kitchen stock and dues at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: me } = useMyProfile();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 13);
      const [invoices, products, customers] = await Promise.all([
        supabase
          .from("invoices")
          .select("invoice_date, grand_total, cost_total, status, payment_method, invoice_items(product_name, quantity, returned_qty)")
          .gte("invoice_date", startOfDay(since).toISOString()),
        supabase
          .from("kitchen_items")
          .select("id, name, unit, current_stock, min_stock, cost_price")
          .eq("is_active", true),
        supabase.from("customers").select("outstanding"),
      ]);
      const bills = (invoices.data ?? []).filter((i) => i.status !== "cancelled");
      const today = isoDate(new Date());
      const todays = bills.filter((b) => isoDate(new Date(b.invoice_date)) === today);
      const byDay = new Map<string, number>();
      for (const b of bills) {
        const key = isoDate(new Date(b.invoice_date));
        byDay.set(key, (byDay.get(key) ?? 0) + Number(b.grand_total));
      }
      const chart = Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        const key = isoDate(d);
        return { day: key.slice(5), sales: Math.round(byDay.get(key) ?? 0) };
      });
      const itemMap = new Map<string, number>();
      for (const b of todays) {
        for (const it of b.invoice_items ?? []) {
          const net = Number(it.quantity) - Number(it.returned_qty);
          if (net > 0) itemMap.set(it.product_name, (itemMap.get(it.product_name) ?? 0) + net);
        }
      }
      const topToday = [...itemMap.entries()]
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const payMap = new Map<string, number>();
      for (const b of todays) payMap.set(b.payment_method, (payMap.get(b.payment_method) ?? 0) + Number(b.grand_total));
      const payments = [...payMap.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
      const lowStock = (products.data ?? []).filter(
        (p) => Number(p.current_stock) <= Number(p.min_stock),
      );
      return {
        todaySales: todays.reduce((s, b) => s + Number(b.grand_total), 0),
        todayProfit: todays.reduce((s, b) => s + Number(b.grand_total) - Number(b.cost_total), 0),
        todayBills: todays.length,
        stockValue: (products.data ?? []).reduce(
          (s, p) => s + Number(p.current_stock) * Number(p.cost_price),
          0,
        ),
        dues: (customers.data ?? []).reduce((s, c) => s + Number(c.outstanding), 0),
        lowStock,
        chart,
        topToday,
        payments,
      };
    },
  });

  return (
    <>
      <PageHeader
        title={`Hello${me?.fullName ? `, ${me.fullName.split(" ")[0]}` : ""}`}
        description="Live snapshot of how the cafe is doing today."
      />
      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { to: "/pos", label: "New order", icon: ShoppingCart },
            { to: "/products", label: "Menu", icon: UtensilsCrossed },
            { to: "/inventory", label: "Kitchen stock", icon: ChefHat },
            { to: "/expenses", label: "Add expense", icon: Wallet },
            { to: "/users", label: "Attendance", icon: CalendarCheck },
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm font-medium shadow-card transition hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
              {label}
              <Plus className="ml-auto size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <Stat label="Today's sales" value={formatCurrency(data?.todaySales ?? 0, false)} />
          <Stat label="Today's profit" value={formatCurrency(data?.todayProfit ?? 0, false)} />
          <Stat label="Orders today" value={formatNumber(data?.todayBills ?? 0)} />
          <Stat label="Kitchen stock value" value={formatCurrency(data?.stockValue ?? 0, false)} />
          <Stat label="Customer dues" value={formatCurrency(data?.dues ?? 0, false)} />
        </div>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Sales — last 14 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip formatter={(v) => formatCurrency(Number(v), false)} />
                <Bar dataKey="sales" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Top menu items today</h2>
            <div className="space-y-2 text-sm">
              {(data?.topToday ?? []).map((t, i) => (
                <div key={t.name} className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="font-mono text-muted-foreground">{formatNumber(t.qty)} sold</span>
                </div>
              ))}
              {!data?.topToday.length && <p className="text-muted-foreground">No orders yet today.</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Today by payment method</h2>
            <div className="space-y-3 text-sm">
              {(data?.payments ?? []).map((p) => {
                const max = data?.payments[0]?.amount || 1;
                return (
                  <div key={p.method}>
                    <div className="mb-1 flex justify-between">
                      <span className="capitalize">{p.method}</span>
                      <span className="font-mono">{formatCurrency(p.amount, false)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(p.amount / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {!data?.payments.length && <p className="text-muted-foreground">No payments yet today.</p>}
            </div>
          </Card>
        </div>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Kitchen low-stock alerts ({data?.lowStock.length ?? 0})</h2>
          <div className="divide-y divide-border text-sm">
            {(data?.lowStock ?? []).slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <span>{p.name}</span>
                <span className="font-mono text-destructive">
                  {formatNumber(Number(p.current_stock))} {p.unit} / alert at {formatNumber(Number(p.min_stock))}
                </span>
              </div>
            ))}
            {!data?.lowStock.length && <p className="py-2 text-muted-foreground">All raw materials are above their alert level.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold sm:text-2xl">{value}</p>
    </Card>
  );
}
