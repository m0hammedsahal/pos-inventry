import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate, parseISODate } from "@/lib/format";

export interface CancellableExpense {
  id: string;
  title: string;
  amount: number | string;
  expense_date: string;
}

interface Props {
  expense: CancellableExpense | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Cancels an expense entry. The entry stays visible (marked cancelled) for the
 * audit trail, but no longer counts in the day book, reports or totals.
 */
export function CancelExpenseDialog({ expense, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (expense) setReason("");
  }, [expense]);

  const cancel = useMutation({
    mutationFn: async () => {
      if (!expense) return;
      const { error } = await supabase.rpc("cancel_expense", { _expense_id: expense.id, _reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense cancelled");
      onOpenChange(false);
      void queryClient.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this expense?</DialogTitle>
          <DialogDescription>
            {expense
              ? `${expense.title} — ${formatCurrency(Number(expense.amount))} on ${formatDate(parseISODate(expense.expense_date))}. It will no longer count towards the day book or reports.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={reason}
          placeholder="Reason (e.g. entered by mistake)"
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep expense
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
