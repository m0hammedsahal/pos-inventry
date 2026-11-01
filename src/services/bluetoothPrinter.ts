/**
 * Bluetooth thermal printing with the Web Bluetooth API.
 *
 * Works in Chrome / Edge (Android, Windows, macOS, Linux, ChromeOS) over HTTPS or
 * localhost, with Bluetooth LOW ENERGY receipt printers (most "BT" 58 mm / 80 mm
 * printers). Not available in iPhone/iPad browsers or Firefox. Printers that only
 * support classic Bluetooth (SPP) cannot be reached from a web page — for those use
 * the browser print dialog or the local print bridge.
 */

// --- minimal Web Bluetooth typings (not part of the standard TypeScript DOM lib) ---
interface BtCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
}
interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BtService[]>;
}
interface BtDevice {
  id: string;
  name?: string;
  gatt?: BtServer;
  addEventListener(type: "gattserverdisconnected", listener: () => void): void;
  removeEventListener(type: "gattserverdisconnected", listener: () => void): void;
}
interface BtApi {
  requestDevice(options: { acceptAllDevices: true; optionalServices: string[] }): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
}

/** GATT services used by common thermal printer chips. Listing them is what lets us talk to the printer. */
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ffb0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000fee7-0000-1000-8000-00805f9b34fb",
];

const SAVED_KEY = "pos.bluetoothPrinter";

export interface SavedPrinter {
  id: string;
  name: string;
}

export interface BluetoothPrinterState {
  supported: boolean;
  /** Why Bluetooth can't be used here (empty when supported) */
  unsupportedReason: string;
  connected: boolean;
  connecting: boolean;
  /** Name of the connected printer, or the saved one when disconnected */
  name: string;
  hasSaved: boolean;
  lastError: string;
}

let device: BtDevice | null = null;
let characteristic: BtCharacteristic | null = null;
let connecting = false;
let lastError = "";
let intentionalDisconnect = false;
let writeChunk = 100;
const listeners = new Set<() => void>();
let snapshot: BluetoothPrinterState | null = null;

const api = (): BtApi | null =>
  typeof navigator !== "undefined" ? ((navigator as unknown as { bluetooth?: BtApi }).bluetooth ?? null) : null;

function unsupportedReason(): string {
  if (typeof window === "undefined") return "";
  if (!window.isSecureContext) return "Bluetooth needs a secure (https) page. Open the app from its https address.";
  if (!api()) return "This browser cannot use Bluetooth printers. Use Chrome or Edge on Android or a computer.";
  return "";
}

export function getSavedPrinter(): SavedPrinter | null {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedPrinter) : null;
  } catch {
    return null;
  }
}

function savePrinter(p: SavedPrinter | null) {
  try {
    if (p) window.localStorage.setItem(SAVED_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(SAVED_KEY);
  } catch {
    /* storage unavailable */
  }
}

function emit() {
  snapshot = null;
  listeners.forEach((l) => l());
}

export function getBluetoothState(): BluetoothPrinterState {
  if (snapshot) return snapshot;
  const reason = unsupportedReason();
  const saved = typeof window !== "undefined" ? getSavedPrinter() : null;
  snapshot = {
    supported: !reason,
    unsupportedReason: reason,
    connected: !!(device?.gatt?.connected && characteristic),
    connecting,
    name: device?.name ?? saved?.name ?? "",
    hasSaved: !!saved,
    lastError,
  };
  return snapshot;
}

export function subscribeBluetooth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: BluetoothPrinterState = {
  supported: false,
  unsupportedReason: "",
  connected: false,
  connecting: false,
  name: "",
  hasSaved: false,
  lastError: "",
};
export const getServerBluetoothState = (): BluetoothPrinterState => SERVER_STATE;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Finds the characteristic the printer accepts data on. */
async function findWritable(server: BtServer): Promise<BtCharacteristic> {
  const services = await server.getPrimaryServices();
  let fallback: BtCharacteristic | null = null;
  for (const service of services) {
    for (const c of await service.getCharacteristics()) {
      if (c.properties.writeWithoutResponse) return c;
      if (c.properties.write && !fallback) fallback = c;
    }
  }
  if (fallback) return fallback;
  throw new Error("This Bluetooth device does not look like a receipt printer.");
}

function onDisconnected() {
  characteristic = null;
  emit();
  // stay connected: if the printer dropped (sleep / out of range) try once to come back
  if (!intentionalDisconnect && device) void reconnect().catch(() => undefined);
}

async function attach(next: BtDevice): Promise<void> {
  if (device && device !== next) device.removeEventListener("gattserverdisconnected", onDisconnected);
  device = next;
  device.removeEventListener("gattserverdisconnected", onDisconnected);
  device.addEventListener("gattserverdisconnected", onDisconnected);
  if (!device.gatt) throw new Error("This device cannot be connected to.");
  const server = await device.gatt.connect();
  characteristic = await findWritable(server);
  savePrinter({ id: device.id, name: device.name || "Bluetooth printer" });
  lastError = "";
}

/** Opens the browser's device chooser so the user can pick and pair a printer. */
export async function scanAndConnect(): Promise<void> {
  const bt = api();
  const reason = unsupportedReason();
  if (!bt || reason) throw new Error(reason || "Bluetooth is not available.");
  connecting = true;
  intentionalDisconnect = false;
  emit();
  try {
    const picked = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
    await attach(picked);
  } catch (e) {
    lastError = friendly(e);
    throw new Error(lastError);
  } finally {
    connecting = false;
    emit();
  }
}

/** Reconnects to the printer used before (no chooser when the browser remembers it). */
export async function reconnect(): Promise<void> {
  const bt = api();
  const reason = unsupportedReason();
  if (!bt || reason) throw new Error(reason || "Bluetooth is not available.");
  connecting = true;
  intentionalDisconnect = false;
  emit();
  try {
    let target = device;
    if (!target) {
      const saved = getSavedPrinter();
      if (!saved) throw new Error("No printer saved yet. Use Scan & pair first.");
      const known = (await bt.getDevices?.().catch(() => [])) ?? [];
      target = known.find((d) => d.id === saved.id) ?? null;
      if (!target) throw new Error("The browser has forgotten this printer. Use Scan & pair again.");
    }
    await attach(target);
  } catch (e) {
    lastError = friendly(e);
    throw new Error(lastError);
  } finally {
    connecting = false;
    emit();
  }
}

/** Try to reconnect quietly (e.g. when the app opens). Never throws. */
export async function tryAutoReconnect(): Promise<boolean> {
  if (getBluetoothState().connected || !getSavedPrinter() || unsupportedReason()) return getBluetoothState().connected;
  try {
    await reconnect();
    return true;
  } catch {
    return false;
  }
}

export function disconnect(): void {
  intentionalDisconnect = true;
  characteristic = null;
  try {
    device?.gatt?.disconnect();
  } catch {
    /* already disconnected */
  }
  emit();
}

/** Forget the saved printer on this device. */
export function forgetPrinter(): void {
  disconnect();
  device = null;
  savePrinter(null);
  emit();
}

function friendly(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/user cancelled|chooser/i.test(message)) return "No printer was selected.";
  if (/GATT|NetworkError|disconnected/i.test(message)) return "Could not reach the printer. Switch it on, keep it close, and try again.";
  if (/not found|no services/i.test(message)) return "This device is not a Bluetooth receipt printer.";
  return message;
}

/** Sends bytes to the printer in small chunks (printers have tiny buffers). */
async function writeAll(data: Uint8Array): Promise<void> {
  if (!characteristic) throw new Error("Printer is not connected.");
  const c = characteristic;
  const noResponse = c.properties.writeWithoutResponse;
  let offset = 0;
  while (offset < data.length) {
    const chunk = data.slice(offset, offset + writeChunk);
    try {
      if (noResponse && c.writeValueWithoutResponse) await c.writeValueWithoutResponse(chunk);
      else if (c.writeValueWithResponse) await c.writeValueWithResponse(chunk);
      else await c.writeValue(chunk);
      offset += chunk.length;
      await sleep(noResponse ? 12 : 4);
    } catch (e) {
      // some printers only accept the minimum 20-byte packets — shrink once and retry
      if (writeChunk > 20) {
        writeChunk = 20;
        continue;
      }
      throw e;
    }
  }
}

/** Prints raw ESC/POS bytes, reconnecting first when needed. */
export async function printBytes(data: Uint8Array): Promise<void> {
  if (!getBluetoothState().connected) await reconnect();
  try {
    await writeAll(data);
  } catch (e) {
    // one retry after a fresh connection
    await reconnect();
    await writeAll(data).catch(() => {
      throw new Error(friendly(e));
    });
  }
}
