/**
 * The ACTIVE restaurant. Every request to the database carries its id in the
 * "x-restaurant-id" header; row-level security uses it so each restaurant only
 * ever sees its own menu, kitchen stock, orders, staff and settings.
 */
const KEY = "pos.activeRestaurant";
export const RESTAURANT_HEADER = "x-restaurant-id";

export function getActiveRestaurantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveRestaurantId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Switch restaurant and reload so every screen starts clean on the new restaurant's data. */
export function switchRestaurant(id: string): void {
  setActiveRestaurantId(id);
  window.location.assign("/pos");
}
