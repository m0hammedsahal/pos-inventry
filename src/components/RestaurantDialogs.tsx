import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { explainError } from "@/lib/errors";
import { switchRestaurant } from "@/lib/restaurant";

/** Form that creates a restaurant and switches to it. Used for the first restaurant and for "Add restaurant". */
export function CreateRestaurantForm({ submitLabel = "Create restaurant" }: { submitLabel?: string }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_restaurant", {
        _name: name,
        _address: address,
        _phone: phone,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success(`${name.trim()} created`);
      switchRestaurant(id);
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !create.isPending) create.mutate();
      }}
    >
      <Field label="Restaurant name">
        <Input autoFocus value={name} placeholder="e.g. Malba Ree — MG Road" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Address (optional)">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label="Phone (optional)">
        <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" disabled={!name.trim() || create.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function AddRestaurantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add restaurant</DialogTitle>
          <DialogDescription>
            Each restaurant has its own menu, kitchen stock, orders, expenses, staff and settings.
          </DialogDescription>
        </DialogHeader>
        <CreateRestaurantForm submitLabel="Create and switch" />
      </DialogContent>
    </Dialog>
  );
}
