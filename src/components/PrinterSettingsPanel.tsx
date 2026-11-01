import { useState } from "react";
import { Bluetooth, BluetoothConnected, BluetoothOff, Printer, RefreshCw, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBluetoothPrinter } from "@/hooks/useBluetoothPrinter";
import { buildTestSlip, columnsFor } from "@/lib/receiptLayout";
import { disconnect, forgetPrinter, reconnect, scanAndConnect } from "@/services/bluetoothPrinter";
import { paperWidth, printTestSlip } from "@/services/printing";
import { openCashDrawer, testPrinter } from "@/services/printerService";
import type { AllSettings, PrinterSettings } from "@/types";

interface Props {
  draft: AllSettings;
  onChange: (patch: Partial<PrinterSettings>) => void;
  /** Only admins can save printer settings; pairing and test printing work for everyone on this device. */
  canEdit: boolean;
  saving: boolean;
  onSave: () => void;
}

/** Printer settings: Bluetooth scan / pair / connect / disconnect / test print, paper width, KOT. */
export function PrinterSettingsPanel({ draft, onChange, canEdit, saving, onSave }: Props) {
  const bt = useBluetoothPrinter();
  const [busy, setBusy] = useState<"scan" | "reconnect" | "test" | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const printer = draft.printer;
  const widthMm = paperWidth(draft);

  async function run(kind: "scan" | "reconnect", task: () => Promise<void>, okMessage: string) {
    setBusy(kind);
    try {
      await task();
      toast.success(okMessage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect to the printer.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const res = await printTestSlip(draft);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } finally {
      setBusy(null);
    }
  }

  const StatusIcon = bt.connected ? BluetoothConnected : bt.supported ? Bluetooth : BluetoothOff;

  return (
    <Card className="space-y-5 p-4">
      <Field label="Printing method">
        <Select value={printer.type} onValueChange={(v) => onChange({ type: v as PrinterSettings["type"] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bluetooth">Bluetooth thermal printer (recommended)</SelectItem>
            <SelectItem value="browser">Device print dialog (any printer)</SelectItem>
            <SelectItem value="thermal">Local print bridge (USB / network)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {printer.type === "bluetooth" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                "flex size-10 items-center justify-center rounded-full " +
                (bt.connected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")
              }
            >
              <StatusIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{bt.name || "No printer paired"}</span>
                <Badge variant={bt.connected ? "secondary" : "outline"}>
                  {bt.connecting ? "Connecting…" : bt.connected ? "Connected" : bt.hasSaved ? "Saved · not connected" : "Not paired"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                The paired printer is remembered on this device and reconnects automatically.
              </p>
            </div>
          </div>

          {!bt.supported && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{bt.unsupportedReason}</p>
          )}
          {bt.lastError && bt.supported && !bt.connected && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{bt.lastError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!bt.supported || busy !== null || bt.connecting}
              onClick={() => run("scan", scanAndConnect, "Printer connected")}
            >
              <Bluetooth className="size-4" /> {bt.hasSaved ? "Scan & pair another" : "Scan & pair printer"}
            </Button>
            {bt.hasSaved && !bt.connected && (
              <Button
                variant="outline"
                disabled={!bt.supported || busy !== null || bt.connecting}
                onClick={() => run("reconnect", reconnect, "Printer reconnected")}
              >
                <RefreshCw className="size-4" /> Reconnect
              </Button>
            )}
            {bt.connected && (
              <Button variant="outline" onClick={() => disconnect()}>
                <Unplug className="size-4" /> Disconnect
              </Button>
            )}
            {bt.hasSaved && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => forgetPrinter()}>
                <Trash2 className="size-4" /> Forget
              </Button>
            )}
            <Button variant="outline" disabled={busy !== null} onClick={test}>
              <Printer className="size-4" /> Test print
            </Button>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Switch the printer on and keep it close, then press <strong>Scan &amp; pair</strong> and choose it from the list.</li>
            <li>Works in Chrome or Edge on Android, Windows, Mac and Linux. iPhone/iPad browsers do not support it.</li>
            <li>The printer must be a Bluetooth <em>Low Energy</em> model. If yours is not listed, use the device print dialog.</li>
            <li>Each phone or tablet pairs its own printer — this is not saved to the shared settings.</li>
          </ul>
        </div>
      )}

      {printer.type === "thermal" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Connection">
            <Select
              value={printer.connection}
              onValueChange={(v) => onChange({ connection: v as PrinterSettings["connection"] })}
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
            <Input value={printer.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Bridge URL">
            <Input value={printer.bridgeUrl} onChange={(e) => onChange({ bridgeUrl: e.target.value })} />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paper width">
          <Select value={printer.width} onValueChange={(v) => onChange({ width: v as "58" | "80" })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58 mm (small printers)</SelectItem>
              <SelectItem value="80">80 mm</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="space-y-3 self-end">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Print KOT below the bill
              <span className="block text-xs text-muted-foreground">Kitchen ticket on the same slip, after a tear line</span>
            </span>
            <Switch checked={printer.printKot !== false} onCheckedChange={(v) => onChange({ printKot: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Print automatically after payment
              <span className="block text-xs text-muted-foreground">No need to press Print</span>
            </span>
            <Switch checked={printer.autoPrint === true} onCheckedChange={(v) => onChange({ autoPrint: v })} />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!canEdit || saving} onClick={onSave}>
          Save printer settings
        </Button>
        <Button variant="outline" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Hide" : "Show"} slip preview
        </Button>
        {printer.type === "thermal" && (
          <>
            <Button
              variant="outline"
              onClick={async () => {
                const res = await testPrinter(printer);
                if (res.ok) toast.success("Test print sent");
                else toast.error(res.message);
              }}
            >
              Test bridge
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const res = await openCashDrawer(printer);
                if (res.ok) toast.success("Drawer opened");
                else toast.error(res.message);
              }}
            >
              Open cash drawer
            </Button>
          </>
        )}
      </div>
      {!canEdit && <p className="text-xs text-muted-foreground">Only an admin can save these settings for the restaurant.</p>}

      {showPreview && (
        <ReceiptPreview
          cols={columnsFor(widthMm)}
          blocks={buildTestSlip(draft.shop.name, columnsFor(widthMm), printer.printKot !== false)}
        />
      )}
    </Card>
  );
}
