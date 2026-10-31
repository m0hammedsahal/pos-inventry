/** True when an error means the cafe database update (migration 0003) has not been applied yet. */
export function isSchemaMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  const msg = (e.message ?? "").toLowerCase();
  return (
    e.code === "PGRST205" ||
    e.code === "PGRST202" ||
    e.code === "42P01" ||
    e.code === "42883" ||
    e.code === "42703" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("could not find the function")
  );
}

/** Turns any thrown value into a message that is useful to a cafe owner. */
export function explainError(error: unknown): string {
  const message = error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
  if (isSchemaMissing(error)) {
    return `Database setup problem: ${message ?? "unknown"}. If this is about a missing table, column or function, run database/schema.sql once in your Supabase SQL editor and reload the app.`;
  }
  if (message && /row-level security|permission denied/i.test(message)) {
    return "Your account is not allowed to do this. Ask an admin or manager.";
  }
  return message || "Something went wrong. Please try again.";
}
