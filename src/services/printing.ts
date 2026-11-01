/**
 * One entry point for printing the slip (customer bill + KOT):
 *   Bluetooth printer (ESC/POS)  ->  local print bridge  ->  device print dialog
 * If the chosen route fails, the bill falls back to the device print dialog so a
 * sale is never lost because of a printer problem.
 */
import type { AllSettings, ReceiptData } from "@/types";
import { buildSlipBlocks, buildTestSlip, columnsFor, type Block } from "@/lib/receiptLayout";
import { encodeBlocks, logoBox, logoToRaster, type Raster } from "@/lib/escpos";
import { printBlocks } from "@/lib/printReceiptDocument";
import { printBytes } from "@/services/bluetoothPrinter";
import { printReceipt as printViaBridge, type PrintResult } from "@/services/printerService";

export const paperWidth = (settings: AllSettings): 58 | 80 => (Number(settings.printer.width) === 80 ? 80 : 58);

async function sendToBluetooth(blocks: Block[], widthMm: 58 | 80): Promise<void> {
  const box = logoBox(widthMm);
  const logos = new Map<string, Raster | null>();
  for (const b of blocks) {
    if (b.kind === "logo" && !logos.has(b.src)) logos.set(b.src, await logoToRaster(b.src, box.width, box.height));
  }
  const bytes = encodeBlocks(blocks, { cols: columnsFor(widthMm), widthMm, logos });
  await printBytes(bytes);
}

async function dispatch(
  blocks: Block[],
  settings: AllSettings,
  viaBridge: (() => Promise<PrintResult>) | null,
): Promise<PrintResult> {
  const widthMm = paperWidth(settings);
  const cols = columnsFor(widthMm);
  const browser = (prefix?: string): PrintResult => {
    const ok = printBlocks(blocks, { widthMm, cols });
    return ok
      ? { ok: true, usedFallback: true, message: prefix ? `${prefix} Opened the print dialog instead.` : "Opened the print dialog" }
      : { ok: false, usedFallback: true, message: "Printing was blocked by the browser. Allow pop-ups and try again." };
  };

  if (settings.printer.type === "bluetooth") {
    try {
      await sendToBluetooth(blocks, widthMm);
      return { ok: true, usedFallback: false, message: "Sent to Bluetooth printer" };
    } catch (e) {
      return browser(`${e instanceof Error ? e.message : "Bluetooth printing failed."}`);
    }
  }
  if (settings.printer.type === "thermal" && viaBridge) {
    const res = await viaBridge();
    if (res.ok) return res;
    return browser(res.message + ".");
  }
  return browser();
}

/** Prints the customer bill and (when enabled) the KOT below it on the same slip. */
export function printSlip(
  receipt: ReceiptData,
  settings: AllSettings,
  opts: { kot?: boolean } = {},
): Promise<PrintResult> {
  const widthMm = paperWidth(settings);
  const kot = opts.kot ?? settings.printer.printKot !== false;
  const blocks = buildSlipBlocks(receipt, { cols: columnsFor(widthMm), kot });
  return dispatch(blocks, settings, () => printViaBridge(receipt, { ...settings.printer, printKot: kot }));
}

/** Sample slip for the "Test print" button. */
export function printTestSlip(settings: AllSettings): Promise<PrintResult> {
  const widthMm = paperWidth(settings);
  const blocks = buildTestSlip(settings.shop.name, columnsFor(widthMm), settings.printer.printKot !== false);
  return dispatch(blocks, settings, null);
}
