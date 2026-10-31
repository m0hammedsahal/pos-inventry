import type { AttendanceStatus } from "@/types";

/** Units offered for raw materials in Kitchen Stock. */
export const KITCHEN_UNITS = [
  "kg",
  "gram",
  "litre",
  "millilitre",
  "piece",
  "packet",
  "dozen",
  "bottle",
  "box",
  "tin",
] as const;

/** Units offered for Menu items (what one sale of the dish/drink is). */
export const MENU_UNITS = ["plate", "piece", "glass", "cup", "bowl", "portion", "bottle", "packet"] as const;

/** Built-in expense categories. They are also seeded in the database. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "rent",
  "salary",
  "electricity",
  "transport",
  "supplies",
  "maintenance",
  "other",
] as const;

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  full_day: "Full Day",
  half_day: "Half Day",
};

/** Days of pay a status counts for. */
export const ATTENDANCE_WEIGHT: Record<AttendanceStatus, number> = {
  full_day: 1,
  half_day: 0.5,
};

export const isAttendanceStatus = (value: string): value is AttendanceStatus =>
  value === "full_day" || value === "half_day";

/** Short, unique-enough item code for menu items created without one. */
export const generateItemCode = (): string => `M${Date.now().toString(36).toUpperCase()}`;
