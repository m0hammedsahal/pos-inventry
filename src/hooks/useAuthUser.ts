import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveRestaurantId, setActiveRestaurantId } from "@/lib/restaurant";
import type { AppRole } from "@/types";

export interface MyRestaurant {
  id: string;
  name: string;
  role: AppRole;
}

export function useAuthUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 60_000,
  });
}

/**
 * The signed-in person, every restaurant they belong to, and their role in the
 * ACTIVE restaurant. The active restaurant is remembered on this device.
 */
export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const [{ data: profile }, { data: memberships, error }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase
          .from("restaurant_members")
          .select("role, restaurants(id, name, is_active)")
          .eq("user_id", auth.user.id),
      ]);
      if (error) throw error;

      const restaurants: MyRestaurant[] = (memberships ?? [])
        .map((m) => {
          const r = m.restaurants as { id: string; name: string; is_active: boolean } | null;
          return r && r.is_active ? { id: r.id, name: r.name, role: m.role as AppRole } : null;
        })
        .filter((r): r is MyRestaurant => r !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      let active = restaurants.find((r) => r.id === getActiveRestaurantId()) ?? null;
      if (!active && restaurants.length) {
        active = restaurants[0]!;
        setActiveRestaurantId(active.id);
      }
      const role: AppRole = active?.role ?? "cashier";
      return {
        id: auth.user.id,
        email: auth.user.email ?? profile?.email ?? "",
        fullName: profile?.full_name || auth.user.email || "Staff",
        restaurants,
        restaurant: active,
        role,
        isAdmin: role === "admin",
        isManager: role === "admin" || role === "manager",
      };
    },
    staleTime: 60_000,
  });
}
