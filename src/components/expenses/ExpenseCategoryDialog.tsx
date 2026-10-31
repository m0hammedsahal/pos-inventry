import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useExpenseCategories } from "./useExpenseCategories";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the category name right after a new one is created. */
  onCreated?: (name: string) => void;
}

/** Create custom expense categories, and delete the ones you added. */
export function ExpenseCategoryDialog({ open, onOpenChange, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { options, canManage } = useExpenseCategories();
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const clean = name.trim().replace(/\s+/g, " ");
      if (!clean) throw new Error("Enter a category name");
      if (options.some((o) => o.name.toLowerCase() === clean.toLowerCase())) {
        throw new Error(`"${clean}" already exists`);
      }
      const { error } = await supabase.from("expense_categories").insert({ name: clean });
      if (error) throw new Error(error.message.includes("duplicate") ? `"${clean}" already exists` : error.message);
      return clean;
    },
    onSuccess: (created) => {
      toast.success(`Category "${created}" added`);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      onCreated?.(created);
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category removed");
      void queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>
            Create your own categories, such as Gas cylinder, Packaging or Staff meals.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !add.isPending) add.mutate();
          }}
        >
          <Input
            autoFocus
            value={name}
            placeholder="New category name"
            maxLength={40}
            disabled={!canManage}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || add.isPending || !canManage}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
        {!canManage && (
          <p className="text-xs text-destructive">
            Custom categories need the latest database update (migration 0003) to be applied.
          </p>
        )}
        <div className="max-h-64 divide-y divide-border overflow-auto rounded-md border border-border">
          {options.map((o) => (
            <div key={o.name} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="capitalize">{o.name}</span>
              {o.isDefault ? (
                <span className="text-xs text-muted-foreground">Built-in</span>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive hover:text-destructive"
                  aria-label={`Delete ${o.name}`}
                  disabled={remove.isPending}
                  onClick={() => o.id && remove.mutate(o.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Deleting a category does not change expenses already recorded under it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
