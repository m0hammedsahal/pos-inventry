const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrNoDecimals = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatCurrency = (value: number | null | undefined, decimals = true): string =>
  (decimals ? inrFormatter : inrNoDecimals).format(Number(value) || 0);

export const formatNumber = (value: number | null | undefined, max = 3): string =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: max }).format(Number(value) || 0);

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return `${formatDate(d)} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
};

export const formatQty = (value: number, unit?: string | null): string =>
  `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;

/** yyyy-mm-dd in local time (for date inputs / range queries). */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Parses a yyyy-mm-dd string as a LOCAL date (new Date("2026-10-01") would be UTC). */
export const parseISODate = (value: string): Date => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};
