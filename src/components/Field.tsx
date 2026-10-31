import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Label + control wrapper used by every form in the app. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
