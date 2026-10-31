import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { explainError } from "@/lib/errors";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/Field";
import { useMyProfile } from "@/hooks/useAuthUser";
import {
  DEFAULT_SETTINGS,
  fetchSettings,
  readCachedSettings,
  saveSettingsSection,
} from "@/services/settingsService";
import { getPrinterStatus, openCashDrawer, testPrinter } from "@/services/printerService";
import { LOGO_ACCEPT, fileToLogoDataUrl } from "@/lib/logo";
import { DEFAULT_BILL_LOGO } from "@/lib/defaultLogo";
import type { AllSettings } from "@/types";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Cafe Settings — Malba Ree" },
      { name: "description", content: "Configure cafe details and logo, GST defaults, invoice numbering and receipt printing." },
      { property: "og:title", content: "Cafe Settings — Malba Ree" },
      { property: "og:description", content: "Configure cafe details and logo, GST defaults and receipt printing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const isAdmin = me?.role === "admin";
  const logoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: remote } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const [draft, setDraft] = useState<AllSettings>(readCachedSettings() ?? DEFAULT_SETTINGS);

  useEffect(() => {
    if (remote) setDraft(remote);
  }, [remote]);

  const { data: printerStatus } = useQuery({
    queryKey: ["printer-status", draft.printer.bridgeUrl, draft.printer.type],
    queryFn: () => getPrinterStatus(draft.printer),
    refetchInterval: 30000,
  });

  const save = useMutation({
    mutationFn: async (section: keyof AllSettings) => {
      await saveSettingsSection(section, draft[section]);
      // keep the restaurant's name in the switcher in step with the Cafe Settings name
      if (section === "shop" && me?.restaurant && draft.shop.name.trim()) {
        const { error } = await supabase
          .from("restaurants")
          .update({ name: draft.shop.name.trim() })
          .eq("id", me.restaurant.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  async function onLogoPicked(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const logoUrl = await fileToLogoDataUrl(file);
      setDraft((prev) => ({ ...prev, shop: { ...prev.shop, logoUrl } }));
      toast.success("Logo ready — press Save cafe settings to apply it to bills.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not use that image.");
    } finally {
      setUploading(false);
      if (logoInput.current) logoInput.current.value = "";
    }
  }

  const set = <K extends keyof AllSettings>(section: K, patch: Partial<AllSettings[K]>) =>
    setDraft((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));

  return (
    <>
      <PageHeader
        title="Settings"
        description={isAdmin ? "Cafe, tax, invoice and printer configuration." : "Read-only — ask an admin to change these."}
      />
      <div className="p-4">
        <Tabs defaultValue="shop">
          <TabsList className="mb-3 flex-wrap">
            <TabsTrigger value="shop">Cafe Settings</TabsTrigger>
            <TabsTrigger value="tax">Tax</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="pos">POS</TabsTrigger>
            <TabsTrigger value="printer">Printer</TabsTrigger>
          </TabsList>

          <TabsContent value="shop">
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-start gap-4 rounded-lg border border-border p-3">
                <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
                  {draft.shop.logoUrl ? (
                    <img src={draft.shop.logoUrl} alt="Cafe logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="px-2 text-center text-xs text-muted-foreground">No logo yet</span>
                  )}
                </div>
                <div className="min-w-48 flex-1 space-y-2">
                  <p className="text-sm font-medium">Cafe logo</p>
                  <p className="text-xs text-muted-foreground">
                    Shown at the top of every printed bill and receipt. PNG, JPG or WebP — a simple, high-contrast
                    logo prints best on thermal paper.
                  </p>
                  <input
                    ref={logoInput}
                    type="file"
                    accept={LOGO_ACCEPT}
                    className="hidden"
                    onChange={(e) => void onLogoPicked(e.target.files?.[0])}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!isAdmin || uploading}
                      onClick={() => logoInput.current?.click()}
                    >
                      <ImagePlus className="size-4" /> {draft.shop.logoUrl ? "Change logo" : "Upload logo"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!isAdmin || draft.shop.logoUrl === DEFAULT_BILL_LOGO}
                      onClick={() => setDraft((prev) => ({ ...prev, shop: { ...prev.shop, logoUrl: DEFAULT_BILL_LOGO } }))}
                    >
                      Use Malba Ree logo
                    </Button>
                    {draft.shop.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={!isAdmin}
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, shop: { ...prev.shop, logoUrl: "" } }))
                        }
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cafe name">
                  <Input value={draft.shop.name} onChange={(e) => set("shop", { name: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={draft.shop.phone} onChange={(e) => set("shop", { phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input value={draft.shop.email} onChange={(e) => set("shop", { email: e.target.value })} />
                </Field>
                <Field label="GSTIN">
                  <Input value={draft.shop.gstin} onChange={(e) => set("shop", { gstin: e.target.value })} />
                </Field>
                <Field label="State">
                  <Input value={draft.shop.state} onChange={(e) => set("shop", { state: e.target.value })} />
                </Field>
                <Field label="Pincode">
                  <Input value={draft.shop.pincode} onChange={(e) => set("shop", { pincode: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address">
                    <Input value={draft.shop.address} onChange={(e) => set("shop", { address: e.target.value })} />
                  </Field>
                </div>
              </div>
              <Button disabled={!isAdmin || save.isPending} onClick={() => save.mutate("shop")}>
                Save cafe settings
              </Button>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Bill preview (top of bill)</p>
                <div className="mx-auto w-64 rounded bg-white p-3 text-center font-mono text-xs leading-tight text-black shadow-sm">
                  {draft.shop.logoUrl ? (
                    <img src={draft.shop.logoUrl} alt="" className="mx-auto mb-1 max-h-16 max-w-full object-contain" />
                  ) : null}
                  <p className="font-bold uppercase">{draft.shop.name || "Your cafe name"}</p>
                  {draft.shop.address ? <p>{draft.shop.address}</p> : null}
                  {draft.shop.phone ? <p>Ph: {draft.shop.phone}</p> : null}
                  <p>--------------------------</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="tax">
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Default GST rate (%)">
                  <Input
                    value={draft.tax.defaultGstRate}
                    onChange={(e) => set("tax", { defaultGstRate: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Shop state (for CGST/SGST vs IGST)">
                  <Input value={draft.tax.shopState} onChange={(e) => set("tax", { shopState: e.target.value })} />
                </Field>
              </div>
              <Button disabled={!isAdmin || save.isPending} onClick={() => save.mutate("tax")}>
                Save tax settings
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="invoice">
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Invoice prefix">
                  <Input value={draft.invoice.prefix} onChange={(e) => set("invoice", { prefix: e.target.value })} />
                </Field>
                <Field label="Receipt width">
                  <Select
                    value={draft.invoice.receiptWidth}
                    onValueChange={(v) => set("invoice", { receiptWidth: v as "58" | "80" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58 mm</SelectItem>
                      <SelectItem value="80">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Receipt footer">
                    <Input value={draft.invoice.footer} onChange={(e) => set("invoice", { footer: e.target.value })} />
                  </Field>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.invoice.showGst}
                  onCheckedChange={(v) => set("invoice", { showGst: v })}
                />
                Print GST breakdown on receipts
              </label>
              <Button disabled={!isAdmin || save.isPending} onClick={() => save.mutate("invoice")}>
                Save invoice settings
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="pos">
            <Card className="space-y-3 p-4">
              <Field label="Maximum cashier discount (%)">
                <Input
                  value={draft.pos.maxCashierDiscountPercent}
                  onChange={(e) => set("pos", { maxCashierDiscountPercent: Number(e.target.value) || 0 })}
                />
              </Field>
              <Button disabled={!isAdmin || save.isPending} onClick={() => save.mutate("pos")}>
                Save POS settings
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="printer">
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm">
                Printer status:
                <Badge variant={printerStatus?.state === "online" ? "secondary" : "destructive"}>
                  {printerStatus?.state ?? "unknown"}
                </Badge>
                <span className="text-muted-foreground">{printerStatus?.message}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Printing mode">
                  <Select
                    value={draft.printer.type}
                    onValueChange={(v) => set("printer", { type: v as "thermal" | "browser" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thermal">Thermal printer (local bridge)</SelectItem>
                      <SelectItem value="browser">Browser print dialog</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Connection">
                  <Select
                    value={draft.printer.connection}
                    onValueChange={(v) => set("printer", { connection: v as "usb" | "bluetooth" | "network" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usb">USB</SelectItem>
                      <SelectItem value="bluetooth">Bluetooth</SelectItem>
                      <SelectItem value="network">Network</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Printer name">
                  <Input value={draft.printer.name} onChange={(e) => set("printer", { name: e.target.value })} />
                </Field>
                <Field label="Bridge URL">
                  <Input
                    value={draft.printer.bridgeUrl}
                    onChange={(e) => set("printer", { bridgeUrl: e.target.value })}
                  />
                </Field>
                <Field label="Paper width">
                  <Select
                    value={draft.printer.width}
                    onValueChange={(v) => set("printer", { width: v as "58" | "80" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58 mm</SelectItem>
                      <SelectItem value="80">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!isAdmin || save.isPending} onClick={() => save.mutate("printer")}>
                  Save printer settings
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const res = await testPrinter(draft.printer);
                    res.ok ? toast.success("Test print sent") : toast.error(res.message);
                  }}
                >
                  Test print
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const res = await openCashDrawer(draft.printer);
                    res.ok ? toast.success("Drawer opened") : toast.error(res.message);
                  }}
                >
                  Open cash drawer
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
