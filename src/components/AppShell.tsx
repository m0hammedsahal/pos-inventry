import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Receipt,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { useTheme } from "@/hooks/useTheme";
import { BrandLogo } from "@/components/BrandLogo";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { RestaurantSwitcher } from "@/components/RestaurantSwitcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { to: "/pos", label: "Billing (POS)", short: "Billing", icon: ShoppingCart, level: "all" },
  { to: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, level: "manager" },
  { to: "/bills", label: "Orders", short: "Orders", icon: Receipt, level: "all" },
  { to: "/products", label: "Menu", short: "Menu", icon: UtensilsCrossed, level: "all" },
  { to: "/inventory", label: "Kitchen Stock", short: "Stock", icon: ChefHat, level: "all" },
  { to: "/customers", label: "Customers", short: "Customers", icon: Users, level: "all" },
  { to: "/purchases", label: "Purchases", short: "Purchases", icon: ClipboardList, level: "manager" },
  { to: "/suppliers", label: "Suppliers", short: "Suppliers", icon: Truck, level: "all" },
  { to: "/expenses", label: "Expenses", short: "Expenses", icon: Wallet, level: "manager" },
  { to: "/reports", label: "Reports", short: "Reports", icon: BarChart3, level: "manager" },
  { to: "/users", label: "Staff", short: "Staff", icon: UsersRound, level: "manager" },
  { to: "/settings", label: "Settings", short: "Settings", icon: Settings, level: "admin" },
] as const;

/** The four screens that live on the phone's bottom bar; everything else is under "More". */
const BOTTOM_TABS = ["/pos", "/bills", "/products", "/inventory"] as const;

const NAV_LINK =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:shadow-sm";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMyProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  const visible = NAV.filter((item) => {
    if (item.level === "all") return true;
    if (item.level === "manager") return me?.isManager ?? false;
    return me?.isAdmin ?? false;
  });
  const tabs = BOTTOM_TABS.map((to) => visible.find((v) => v.to === to)).filter((v) => !!v);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const ThemeIcon = theme === "dark" ? Sun : Moon;

  const userBlock = (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{me?.fullName}</p>
          <p className="text-xs capitalize text-sidebar-foreground/60">{me?.role}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggle}
        >
          <ThemeIcon className="size-4" />
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={signOut}
      >
        <LogOut className="size-4" /> Sign out
      </Button>
    </div>
  );

  const brand = (
    <div className="px-4 pb-3 pt-4">
      <div className="rounded-xl bg-white px-3 py-2 shadow-card">
        <BrandLogo variant="full" className="mx-auto h-16" />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop / tablet sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar md:flex">
        {brand}
        <div className="px-3 pb-3">
          <RestaurantSwitcher />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visible.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={NAV_LINK}>
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        {userBlock}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 bg-sidebar px-3 pb-2 safe-top md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Open menu"
            onClick={() => setMoreOpen(true)}
          >
            <MenuIcon className="size-5" />
          </Button>
          <div className="mt-1 min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{me?.restaurant?.name}</p>
            <p className="text-[11px] capitalize text-sidebar-foreground/60">{me?.role}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggle}
          >
            <ThemeIcon className="size-5" />
          </Button>
        </header>

        <DatabaseNotice />
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>

        {/* Phone bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card safe-bottom shadow-panel md:hidden">
          {tabs.map((item) =>
            item ? (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground data-[status=active]:text-primary"
              >
                <item.icon className="size-5" />
                {item.short}
              </Link>
            ) : null,
          )}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
          >
            <MenuIcon className="size-5" />
            More
          </button>
        </nav>
      </div>

      {/* Phone full menu */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Go to any page</SheetDescription>
          {brand}
          <div className="px-3 pb-3">
            <RestaurantSwitcher />
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {visible.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={NAV_LINK} onClick={() => setMoreOpen(false)}>
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
          {userBlock}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-card px-3 py-3 sm:px-5 sm:py-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div> : null}
    </div>
  );
}
