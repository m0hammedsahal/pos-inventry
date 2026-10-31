/**
 * Printer abstraction.
 *
 *   React POS -> printerService -> local print bridge (HTTP) -> ESC/POS thermal printer
 *
 * The browser never talks to USB directly. A small local service (e.g. a Python
 * Flask app on http://localhost:8765) exposes /print, /status, /test and /drawer.
 * When the bridge is unreachable we fall back to browser printing so an invoice
 * is never lost because of a printer problem.
 */
import type { PrinterSettings, ReceiptData } from "@/types";
import { buildReceiptText } from "@/lib/receipt";

export type PrinterState = "online" | "offline" | "unknown";

export interface PrinterStatus {
  state: PrinterState;
  message: string;
}

const timeoutFetch = async (url: string, init: RequestInit = {}, ms = 2500): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export async function getPrinterStatus(settings: PrinterSettings): Promise<PrinterStatus> {
  if (settings.type === "browser") return { state: "online", message: "Browser printing" };
  try {
    const res = await timeoutFetch(`${settings.bridgeUrl}/status`);
    if (!res.ok) return { state: "offline", message: "Print service returned an error" };
    const body = (await res.json().catch(() => ({}))) as { printer?: string; ready?: boolean };
    return body.ready === false
      ? { state: "offline", message: "Printer is not connected" }
      : { state: "online", message: body.printer ?? settings.name };
  } catch {
    return { state: "offline", message: "Local print service not reachable" };
  }
}

export interface PrintResult {
  ok: boolean;
  usedFallback: boolean;
  message: string;
}

export async function printReceipt(
  receipt: ReceiptData,
  settings: PrinterSettings,
): Promise<PrintResult> {
  const text = buildReceiptText(receipt, Number(settings.width) === 80 ? 42 : 32);

  if (settings.type === "thermal") {
    try {
      const res = await timeoutFetch(`${settings.bridgeUrl}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printer: settings.name,
          connection: settings.connection,
          width: Number(settings.width),
          text,
          // PNG/JPEG data URL of the cafe logo, to print above the text (bridges may ignore it)
          logo: receipt.shop.logoUrl ?? null,
          invoiceNumber: receipt.invoiceNumber,
        }),
      });
      if (res.ok) return { ok: true, usedFallback: false, message: "Sent to thermal printer" };
    } catch {
      /* fall through to browser print */
    }
  }
  return { ok: false, usedFallback: true, message: "Printer unavailable" };
}

export function browserPrint(): void {
  if (typeof window !== "undefined") window.print();
}

export async function testPrinter(settings: PrinterSettings): Promise<PrintResult> {
  try {
    const res = await timeoutFetch(`${settings.bridgeUrl}/test`, { method: "POST" });
    return res.ok
      ? { ok: true, usedFallback: false, message: "Test print sent" }
      : { ok: false, usedFallback: false, message: "Print service rejected the test" };
  } catch {
    return { ok: false, usedFallback: false, message: "Local print service not reachable" };
  }
}

export async function openCashDrawer(settings: PrinterSettings): Promise<PrintResult> {
  try {
    const res = await timeoutFetch(`${settings.bridgeUrl}/drawer`, { method: "POST" });
    return res.ok
      ? { ok: true, usedFallback: false, message: "Cash drawer opened" }
      : { ok: false, usedFallback: false, message: "Unable to open cash drawer" };
  } catch {
    return { ok: false, usedFallback: false, message: "Local print service not reachable" };
  }
}
