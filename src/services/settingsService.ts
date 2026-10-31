import { supabase } from "@/integrations/supabase/client";
import type { AllSettings } from "@/types";
import { DEFAULT_BILL_LOGO } from "@/lib/defaultLogo";

export const DEFAULT_SETTINGS: AllSettings = {
  shop: {
    name: "My Cafe",
    address: "",
    phone: "",
    email: "",
    gstin: "",
    state: "Kerala",
    pincode: "",
    // Malba Ree logo until the cafe uploads its own ("" = deliberately no logo)
    logoUrl: DEFAULT_BILL_LOGO,
  },
  invoice: { prefix: "INV", nextNumber: 1, receiptWidth: "58", footer: "Thank you! Visit Again!", showGst: true },
  tax: { defaultGstRate: 5, shopState: "Kerala" },
  pos: { maxCashierDiscountPercent: 10, allowNegativeStock: false },
  printer: { type: "thermal", width: "58", connection: "usb", name: "POS-58", bridgeUrl: "http://localhost:8765" },
};

import { getActiveRestaurantId } from "@/lib/restaurant";

const cacheKey = () => `pos.settings.cache.${getActiveRestaurantId() ?? "none"}`;

export const readCachedSettings = (): AllSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(cacheKey());
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as AllSettings) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export async function fetchSettings(): Promise<AllSettings> {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) {
    return readCachedSettings();
  }
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const row of data ?? []) {
    merged[row.key] = { ...(merged[row.key] as object), ...(row.value as object) };
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(cacheKey(), JSON.stringify(merged));
  }
  return merged as unknown as AllSettings;
}

export async function saveSettingsSection<K extends keyof AllSettings>(
  key: K,
  value: AllSettings[K],
): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert(
      { key: key as string, value: value as never, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,key" },
    );
  if (error) throw new Error("Unable to save settings. You may not have permission.");
}
