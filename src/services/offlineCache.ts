/**
 * Local cache for the counter's reference data so billing keeps working when the
 * shop's internet drops. Only non-sensitive catalogue data is stored.
 */

import { getActiveRestaurantId } from "@/lib/restaurant";

const prefix = () => `pos.cache.${getActiveRestaurantId() ?? "none"}.`;

interface Envelope<T> {
  savedAt: number;
  rows: T;
}

export function saveCache<T>(key: string, rows: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: Envelope<T> = { savedAt: Date.now(), rows };
    window.localStorage.setItem(prefix() + key, JSON.stringify(envelope));
  } catch {
    /* storage full or unavailable — cache is best effort */
  }
}

export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(prefix() + key);
    if (!raw) return null;
    return (JSON.parse(raw) as Envelope<T>).rows;
  } catch {
    return null;
  }
}

export function cacheSavedAt(key: string): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(prefix() + key);
    if (!raw) return null;
    const { savedAt } = JSON.parse(raw) as Envelope<unknown>;
    return savedAt ? new Date(savedAt) : null;
  } catch {
    return null;
  }
}

/** Fetch fresh rows, cache them, and fall back to the cache when offline. */
export async function cachedQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const rows = await fetcher();
    saveCache(key, rows);
    return rows;
  } catch (error) {
    const cached = readCache<T>(key);
    if (cached) return cached;
    throw error;
  }
}
