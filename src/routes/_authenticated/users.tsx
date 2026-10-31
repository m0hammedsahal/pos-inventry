import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { PageHeader } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, formatNumber, isoDate, parseISODate } from "@/lib/format";
import { ATTENDANCE_LABEL, ATTENDANCE_WEIGHT, isAttendanceStatus } from "@/lib/cafe";
import type { AppRole, AttendanceStatus, StaffMember } from "@/types";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Staff & Attendance — Malba Ree" },
      { name: "description", content: "Add staff, log daily attendance (full day or half day) and manage login roles." },
      { property: "og:title", content: "Staff & Attendance — Malba Ree" },
      { property: "og:description", content: "Add staff and log daily attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffPage,
});

const ROLES: AppRole[] = ["admin", "manager", "cashier"];
const DESIGNATIONS = ["Cook", "Chef", "Barista", "Waiter", "Cashier", "Helper", "Cleaner", "Delivery"];

const emptyStaff = { name: "", phone: "", designation: "", daily_wage: "", joined_on: isoDate(new Date()) };

const shiftDay = (iso: string, days: number) => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

function StaffPage() {
  const { data: me } = useMyProfile();
  const isAdmin = me?.isAdmin ?? false;

  return (
    <>
      <PageHeader title="Staff" description="Your team, daily attendance and — for admins — who can use this restaurant." />
      <div className="p-4">
        <Tabs defaultValue="team">
          <TabsList className="mb-3 flex-wrap">
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="attendance">Daily attendance</TabsTrigger>
            <TabsTrigger value="summary">Monthly summary</TabsTrigger>
            {isAdmin && <TabsTrigger value="accounts">Team access</TabsTrigger>}
          </TabsList>
          <TabsContent value="team">
            <TeamTab />
          </TabsContent>
          <TabsContent value="attendance">
            <AttendanceTab />
          </TabsContent>
          <TabsContent value="summary">
            <SummaryTab />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="accounts">
              <AccountsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}

function useStaffMembers() {
  return useQuery({
    queryKey: ["staff-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_members").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
}

/* ------------------------------------------------------------------ Team */

function TeamTab() {
  const queryClient = useQueryClient();
  const { data: staff = [] } = useStaffMembers();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyStaff });
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Enter the staff member's name");
      const { error } = await supabase.from("staff_members").insert({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        designation: form.designation.trim() || null,
        daily_wage: Number(form.daily_wage) || 0,
        joined_on: form.joined_on || isoDate(new Date()),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${form.name.trim()} added to staff`);
      setOpen(false);
      setForm({ ...emptyStaff });
      void queryClient.invalidateQueries({ queryKey: ["staff-members"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_members").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff member removed");
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["staff-members"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{staff.length} staff members</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add Staff
        </Button>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2 text-right">Daily wage</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2">{s.designation ?? "—"}</td>
                <td className="px-3 py-2">{s.phone ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {Number(s.daily_wage) ? formatCurrency(Number(s.daily_wage), false) : "—"}
                </td>
                <td className="px-3 py-2">{formatDate(parseISODate(s.joined_on))}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemoving(s)}
                  >
                    <Trash2 className="size-4" /> Remove
                  </Button>
                </td>
              </tr>
            ))}
            {!staff.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No staff yet. Use Add Staff to create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Staff</DialogTitle>
            <DialogDescription>Add a team member so you can log their daily attendance.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            </div>
            <Field label="Role / designation">
              <Input
                list="staff-designations"
                value={form.designation}
                placeholder="e.g. Cook"
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
              />
              <datalist id="staff-designations">
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Daily wage (₹, optional)">
              <Input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={form.daily_wage}
                onChange={(e) => setForm({ ...form, daily_wage: e.target.value })}
              />
            </Field>
            <Field label="Joining date">
              <Input
                type="date"
                value={form.joined_on}
                onChange={(e) => setForm({ ...form, joined_on: e.target.value })}
              />
            </Field>
          </div>
          <Button className="w-full" disabled={!form.name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add Staff
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer appear in the team list or the daily attendance sheet. Attendance already recorded
              is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------ Attendance */

function AttendanceTab() {
  const queryClient = useQueryClient();
  const today = isoDate(new Date());
  const [date, setDate] = useState(today);
  const { data: staff = [] } = useStaffMembers();

  const { data: records = [] } = useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_attendance").select("*").eq("attendance_date", date);
      if (error) throw error;
      return data;
    },
  });

  const statusOf = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    for (const r of records) if (isAttendanceStatus(r.status)) map.set(r.staff_id, r.status);
    return map;
  }, [records]);

  const mark = useMutation({
    mutationFn: async ({ staffId, status }: { staffId: string; status: AttendanceStatus | null }) => {
      if (status === null) {
        const { error } = await supabase
          .from("staff_attendance")
          .delete()
          .eq("staff_id", staffId)
          .eq("attendance_date", date);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("staff_attendance")
        .upsert({ staff_id: staffId, attendance_date: date, status }, { onConflict: "staff_id,attendance_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      void queryClient.invalidateQueries({ queryKey: ["attendance-month"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const counts = { full: 0, half: 0 };
  for (const s of staff) {
    const st = statusOf.get(s.id);
    if (st === "full_day") counts.full += 1;
    if (st === "half_day") counts.half += 1;
  }
  const notMarked = staff.length - counts.full - counts.half;

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Attendance date">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Button
              size="icon"
              variant="outline"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => setDate(shiftDay(date, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </Field>
        {date !== today && (
          <Button variant="ghost" onClick={() => setDate(today)}>
            Today
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Full day: {counts.full}</Badge>
          <Badge variant="secondary">Half day: {counts.half}</Badge>
          <Badge variant="outline">Not marked: {notMarked}</Badge>
        </div>
      </Card>

      <Card className="divide-y divide-border p-0">
        {staff.map((s) => {
          const current = statusOf.get(s.id) ?? null;
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.designation ?? "Staff"}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {(["full_day", "half_day"] as const).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={current === st ? "default" : "outline"}
                    disabled={mark.isPending}
                    onClick={() => mark.mutate({ staffId: s.id, status: st })}
                  >
                    {ATTENDANCE_LABEL[st]}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!current || mark.isPending}
                  onClick={() => mark.mutate({ staffId: s.id, status: null })}
                >
                  Clear
                </Button>
              </div>
            </div>
          );
        })}
        {!staff.length && (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            Add staff in the Team tab to start logging attendance.
          </p>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Tap Full Day or Half Day to record it for the selected date. Staff with no mark are treated as absent.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- Summary */

function SummaryTab() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const { data: staff = [] } = useStaffMembers();

  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = `${month}-01`;
  const last = isoDate(new Date(y, m, 0));

  const { data: records = [] } = useQuery({
    queryKey: ["attendance-month", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("*")
        .gte("attendance_date", first)
        .lte("attendance_date", last);
      if (error) throw error;
      return data;
    },
  });

  const rows = staff.map((s) => {
    let full = 0;
    let half = 0;
    for (const r of records) {
      if (r.staff_id !== s.id) continue;
      if (r.status === "full_day") full += 1;
      if (r.status === "half_day") half += 1;
    }
    const days = full * ATTENDANCE_WEIGHT.full_day + half * ATTENDANCE_WEIGHT.half_day;
    return { s, full, half, days, pay: days * Number(s.daily_wage) };
  });

  return (
    <div className="space-y-3">
      <Field label="Month">
        <Input
          className="w-48"
          type="month"
          value={month}
          max={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      </Field>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Full days</th>
              <th className="px-3 py-2 text-right">Half days</th>
              <th className="px-3 py-2 text-right">Days worked</th>
              <th className="px-3 py-2 text-right">Wages earned</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, full, half, days, pay }) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-right font-mono">{full}</td>
                <td className="px-3 py-2 text-right font-mono">{half}</td>
                <td className="px-3 py-2 text-right font-mono">{formatNumber(days)}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {Number(s.daily_wage) ? formatCurrency(pay, false) : "—"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  No staff yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">A half day counts as 0.5 of a day. Wages = days worked × daily wage.</p>
    </div>
  );
}

/* ----------------------------------------------------------- Team access */

function AccountsTab() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("cashier");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["staff", me?.restaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_staff");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["staff"] });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AppRole }) => {
      const { error } = await supabase.rpc("set_user_role", { _user_id: id, _role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      refresh();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_restaurant_member", { _email: email.trim(), _role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${email.trim()} can now use ${me?.restaurant?.name ?? "this restaurant"}`);
      setEmail("");
      refresh();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("remove_restaurant_member", { _user_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access removed");
      setRemoving(null);
      refresh();
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold">Give someone access to {me?.restaurant?.name}</p>
          <p className="text-xs text-muted-foreground">
            They must already have signed up on the login screen. Enter their email and choose what they can do here.
            Access is per restaurant — adding someone here does not give them your other restaurants.
          </p>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim() && !addMember.isPending) addMember.mutate();
          }}
        >
          <Input
            className="min-w-56 flex-1"
            type="email"
            inputMode="email"
            placeholder="their-email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!email.trim() || addMember.isPending}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          <strong>Admin</strong>: everything, including settings and team. <strong>Manager</strong>: menu, stock, expenses,
          reports, staff. <strong>Cashier</strong>: billing, orders and customers.
        </p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Since</th>
              <th className="w-40 px-3 py-2">Role</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{s.full_name || "-"}</td>
                <td className="px-3 py-2">{s.email ?? "-"}</td>
                <td className="px-3 py-2">{formatDate(s.created_at)}</td>
                <td className="px-3 py-2">
                  <Select value={s.role} onValueChange={(v) => setRole.mutate({ id: s.id, role: v as AppRole })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 text-right">
                  {s.id !== me?.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoving({ id: s.id, name: s.full_name || s.email || "this person" })}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  No team members visible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to open {me?.restaurant?.name}. Their account and other restaurants are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction disabled={removeMember.isPending} onClick={() => removing && removeMember.mutate(removing.id)}>
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
