import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/Field";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — RetailPro" },
      { name: "description", content: "Supplier directory with contact details, GSTIN and opening balances." },
      { property: "og:title", content: "Suppliers — RetailPro" },
      { property: "og:description", content: "Supplier directory with contacts, GSTIN and balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

const empty = { name: "", company: "", phone: "", email: "", gstin: "", address: "", opening_balance: 0, notes: "" };

function SuppliersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").insert({
        ...form,
        company: form.company || null,
        phone: form.phone || null,
        email: form.email || null,
        gstin: form.gstin || null,
        address: form.address || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supplier added");
      setOpen(false);
      setForm({ ...empty });
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${suppliers.length} suppliers on record.`}
        actions={
          me?.isManager ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New supplier
            </Button>
          ) : null
        }
      />
      <div className="p-4">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">GSTIN</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.company ?? "-"}</td>
                  <td className="px-3 py-2">{s.phone ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.gstin ?? "-"}</td>
                </tr>
              ))}
              {!suppliers.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                    No suppliers yet.
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
            <DialogTitle>New supplier</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </Field>
            <Field label="Opening balance">
              <Input
                value={form.opening_balance}
                onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) || 0 })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
            </div>
          </div>
          <Button className="w-full" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>
            Save supplier
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
