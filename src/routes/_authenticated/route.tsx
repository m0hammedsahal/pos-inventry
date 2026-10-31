import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { RestaurantOnboarding } from "@/components/RestaurantOnboarding";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { useMyProfile } from "@/hooks/useAuthUser";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: me, isLoading, error } = useMyProfile();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (error) {
    return (
      <div className="min-h-screen">
        <DatabaseNotice />
        <p className="p-6 text-sm text-destructive">Could not load your account. Check your connection and reload.</p>
      </div>
    );
  }
  // Signed in but not part of any restaurant yet
  if (!me?.restaurant) return <RestaurantOnboarding />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
