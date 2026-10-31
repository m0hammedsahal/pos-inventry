import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { useMyProfile } from "@/hooks/useAuthUser";
import { AddRestaurantDialog } from "@/components/RestaurantDialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchRestaurant } from "@/lib/restaurant";

/** Shows the active restaurant and lets the user switch to another one or add a new one. */
export function RestaurantSwitcher() {
  const { data: me } = useMyProfile();
  const [adding, setAdding] = useState(false);
  if (!me?.restaurant) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-auto w-full justify-between gap-2 border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Store className="size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{me.restaurant.name}</span>
                <span className="block text-[11px] capitalize text-sidebar-foreground/60">{me.restaurant.role}</span>
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Your restaurants</DropdownMenuLabel>
          {me.restaurants.map((r) => (
            <DropdownMenuItem
              key={r.id}
              onSelect={() => r.id !== me.restaurant?.id && switchRestaurant(r.id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{r.name}</span>
              {r.id === me.restaurant?.id && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setAdding(true)}>
            <Plus className="size-4" /> Add restaurant
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddRestaurantDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
