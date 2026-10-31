import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers & Credit — RetailPro" },
      { name: "description", content: "Customer records, GSTIN details, credit limits and outstanding collections." },
      { property: "og:title", content: "Customers & Credit — RetailPro" },
      { property: "og:description", content: "Customer records, credit limits and outstanding collections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomersPage,
});

const empty = { name: "", phone: "", email: "", address: "", gstin: "", state: "", credit_limit: 0 };

function CustomersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [term, setTerm] = useState("");

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").insert({
        ...form,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        gstin: form.gstin || null,
        state: form.state || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer added");
      setOpen(false);
      setForm({ ...empty });
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const collect = useMutation({
    mutationFn: async (id: string) => {
      const raw = window.prompt("Amount received?") ?? "";
      const amount = Number(raw);
      if (!amount || amount <= 0) throw new Error("Enter a valid amount");
      const { error } = await supabase.rpc("collect_customer_payment", {
        _customer_id: id,
        _amount: amount,
        _method: "cash",
        _reference: "",
        _note: "Counter collection",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const filtered = customers.filter((c) =>
    term.trim()
      ? `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(term.trim().toLowerCase())
      : true,
  );
  const totalDues = customers.reduce((s, c) => s + Number(c.outstanding), 0);

  return (
    <>
      <PageHeader
        title="Customers"
        description={`Total outstanding ${formatCurrency(totalDues, false)}`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New customer
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <Input
          className="max-w-sm"
          placeholder="Search name or phone"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">GSTIN</th>
                <th className="px-3 py-2 text-right">Credit limit</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.phone ?? "-"}</td>
                  <td className="px-3 py-2">{c.state ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.gstin ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(c.credit_limit))}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(c.outstanding))}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Number(c.outstanding) <= 0}
                      onClick={() => collect.mutate(c.id)}
                    >
                      Collect
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No customers yet.
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
            <DialogTitle>New customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="State">
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </Field>
            <Field label="Credit limit">
              <Input
                value={form.credit_limit}
                onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) || 0 })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
            </div>
          </div>
          <Button className="w-full" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>
            Save customer
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
