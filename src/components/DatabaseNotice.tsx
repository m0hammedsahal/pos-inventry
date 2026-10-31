import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isSchemaMissing } from "@/lib/errors";

/** Warns clearly when the Supabase project has not had database/schema.sql run on it yet. */
export function DatabaseNotice() {
  const { data: missing } = useQuery({
    queryKey: ["schema-check"],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { error } = await supabase.from("restaurants").select("id", { head: true, count: "exact" });
      return !!error && isSchemaMissing(error);
    },
  });

  if (!missing) return null;
  return (
    <div className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Database not set up.</strong> Run <code className="rounded bg-background/60 px-1">database/schema.sql</code>{" "}
        once in your Supabase SQL editor (SQL Editor → New query → paste → Run), then reload this page.
      </p>
    </div>
  );
}
