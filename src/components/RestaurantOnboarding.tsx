import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { CreateRestaurantForm } from "@/components/RestaurantDialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown to a signed-in person who does not belong to any restaurant yet. */
export function RestaurantOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-accent to-background px-4 py-8 safe-bottom">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <BrandLogo variant="full" className="mb-2 h-24" />
          <CardTitle>Set up your restaurant</CardTitle>
          <CardDescription>
            Create your first restaurant to start. You can add more restaurants later, each with its own menu and
            stock. If a colleague should add you to theirs, ask them to add your email under Staff → Team access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CreateRestaurantForm />
          <Button variant="ghost" className="w-full" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
