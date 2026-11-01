/**
 * Receipt layout — ONE description of the slip (customer bill + KOT) that is
 * rendered three ways: ESC/POS bytes (Bluetooth), HTML (browser print / preview)
 * and plain text (local print bridge). Keeping a single layout means all of them
 * always look the same.
 */
import type { ReceiptData } from "@/types";

export type Align = "left" | "center" | "right";
/** normal = 1x1, tall = double height, big = double width + double height */
export type TextSize = "normal" | "tall" | "big";

export type Block =
  | { kind: "text"; text: string; align?: Align; bold?: boolean; size?: TextSize }
  | { kind: "logo"; src: string }
  | { kind: "rule"; char?: string }
  | { kind: "feed"; lines: number }
  | { kind: "cut" };

export const KOT_TEAR_LINE = "- - - - - KOT - - - - -";

/** Printable columns for a paper width. */
export const columnsFor = (widthMm: number): number => (widthMm >= 80 ? 42 : 32);

const money = (n: number) => n.toFixed(2);
const rs = (n: number) => `Rs ${n.toFixed(2)}`;
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3))));

const clip = (text: string, width: number) => text.slice(0, width);
const padRight = (text: string, width: number) => clip(text, width).padEnd(width, " ");
const padLeft = (text: string, width: number) => clip(text, width).padStart(width, " ");

/** "label ........ value" in exactly `width` columns. */
export const row = (left: string, right: string, width: number): string => {
  const room = Math.max(0, width - right.length - 1);
  return padRight(left, room) + " " + right;
};

/** Word-wraps `text` to lines of at most `width` characters. */
export function wrap(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let word of words) {
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if ((current + " " + word).length <= width) current += " " + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

const timeText = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const isSafeLogo = (url?: string | null): url is string =>
  !!url && /^data:image\/(png|jpe?g|webp);base64,/i.test(url);

/** Customer bill. */
export function buildBillBlocks(receipt: ReceiptData, cols: number): Block[] {
  const b: Block[] = [];
  const t = (text: string, extra: Partial<Extract<Block, { kind: "text" }>> = {}) =>
    b.push({ kind: "text", text, ...extra });

  // Header: centred logo (printed slightly smaller), then the cafe details
  if (isSafeLogo(receipt.shop.logoUrl)) b.push({ kind: "logo", src: receipt.shop.logoUrl });
  for (const line of wrap(receipt.shop.name.toUpperCase(), cols)) t(line, { align: "center", bold: true, size: "tall" });
  if (receipt.shop.address) for (const line of wrap(receipt.shop.address, cols)) t(line, { align: "center" });
  if (receipt.shop.phone) t(`Ph: ${receipt.shop.phone}`, { align: "center" });
  if (receipt.shop.gstin) t(`GSTIN: ${receipt.shop.gstin}`, { align: "center" });
  b.push({ kind: "rule" });

  // Bill details
  t(row("Bill No", receipt.invoiceNumber, cols), { bold: true });
  t(row("Date", `${dateText(receipt.date)} ${timeText(receipt.date)}`, cols));
  if (receipt.tableNo) t(row("Table", receipt.tableNo, cols), { bold: true });
  if (receipt.cashierName) t(row("Cashier", receipt.cashierName, cols));
  if (receipt.customerName) t(row("Customer", receipt.customerName, cols));
  b.push({ kind: "rule" });

  // Items: Item Name | Qty | Price
  const qtyW = 4;
  const priceW = cols >= 42 ? 10 : 9;
  const nameW = cols - qtyW - priceW - 2;
  t(`${padRight("Item", nameW)} ${padLeft("Qty", qtyW)} ${padLeft("Price", priceW)}`, { bold: true });
  b.push({ kind: "rule" });
  for (const item of receipt.items) {
    const lines = wrap(item.name, nameW);
    lines.forEach((name, i) => {
      if (i === 0) {
        t(`${padRight(name, nameW)} ${padLeft(qtyText(item.quantity), qtyW)} ${padLeft(money(item.lineTotal), priceW)}`);
      } else {
        t(name);
      }
    });
    if (item.discount > 0) t(row("  Discount", `-${money(item.discount)}`, cols));
  }
  b.push({ kind: "rule" });

  // Totals (only the lines that matter)
  const tax = receipt.cgst + receipt.sgst + receipt.igst;
  const hasAdjustments = receipt.itemDiscount > 0 || receipt.billDiscount > 0 || tax > 0 || receipt.roundOff !== 0;
  if (hasAdjustments) {
    t(row("Sub Total", rs(receipt.subtotal), cols));
    if (receipt.itemDiscount > 0) t(row("Item Discount", `-${money(receipt.itemDiscount)}`, cols));
    if (receipt.billDiscount > 0) t(row("Bill Discount", `-${money(receipt.billDiscount)}`, cols));
    if (receipt.cgst > 0) t(row("CGST", money(receipt.cgst), cols));
    if (receipt.sgst > 0) t(row("SGST", money(receipt.sgst), cols));
    if (receipt.igst > 0) t(row("IGST", money(receipt.igst), cols));
    if (receipt.roundOff !== 0) t(row("Round Off", money(receipt.roundOff), cols));
    b.push({ kind: "rule" });
  }

  // GRAND TOTAL — larger and bold. Double width when it fits, otherwise double height.
  const amount = rs(receipt.grandTotal);
  const bigCols = Math.floor(cols / 2);
  if ("TOTAL".length + 1 + amount.length <= bigCols) {
    t(row("TOTAL", amount, bigCols), { bold: true, size: "big" });
  } else {
    t(row("TOTAL", amount, cols), { bold: true, size: "tall" });
  }
  b.push({ kind: "rule" });

  // Payments
  for (const p of receipt.payments) {
    t(row(p.method.toUpperCase(), rs(p.amount), cols));
    if (p.reference) t(`  Ref: ${p.reference}`);
  }
  if (receipt.payments.length) b.push({ kind: "rule" });

  for (const line of wrap(receipt.footer || "Thank you! Visit again", cols)) t(line, { align: "center" });
  return b;
}

/** Kitchen Order Ticket: order / table number, time, and only Item Name + Qty. */
export function buildKotBlocks(receipt: ReceiptData, cols: number): Block[] {
  const b: Block[] = [];
  const t = (text: string, extra: Partial<Extract<Block, { kind: "text" }>> = {}) =>
    b.push({ kind: "text", text, ...extra });

  t("KITCHEN ORDER", { align: "center", bold: true, size: "tall" });
  b.push({ kind: "rule" });
  for (const line of wrap(`Order: ${receipt.invoiceNumber}`, cols)) t(line, { bold: true });
  if (receipt.tableNo) t(`Table: ${receipt.tableNo}`, { bold: true, size: "tall" });
  t(`Time : ${timeText(receipt.date)}   ${dateText(receipt.date)}`);
  b.push({ kind: "rule", char: "=" });

  // Item Name + Qty only — bold and tall so the kitchen can read it from a distance
  for (const item of receipt.items) {
    const prefix = `${qtyText(item.quantity)} x `;
    const lines = wrap(item.name, Math.max(8, cols - prefix.length));
    lines.forEach((name, i) => t((i === 0 ? prefix : " ".repeat(prefix.length)) + name, { bold: true, size: "tall" }));
  }
  b.push({ kind: "rule", char: "=" });
  return b;
}

/** Whole slip: bill, then (optionally) a clear gap, the KOT tear line and the KOT. */
export function buildSlipBlocks(
  receipt: ReceiptData,
  opts: { cols: number; kot: boolean; cut?: boolean },
): Block[] {
  const blocks = buildBillBlocks(receipt, opts.cols);
  if (opts.kot) {
    blocks.push({ kind: "feed", lines: 4 });
    blocks.push({ kind: "text", text: KOT_TEAR_LINE, align: "center", bold: true });
    blocks.push({ kind: "feed", lines: 1 });
    blocks.push(...buildKotBlocks(receipt, opts.cols));
  }
  blocks.push({ kind: "feed", lines: 3 });
  if (opts.cut !== false) blocks.push({ kind: "cut" });
  return blocks;
}

/** Small sample used by "Test print". */
export function buildTestSlip(shopName: string, cols: number, kot: boolean): Block[] {
  const fake: ReceiptData = {
    invoiceNumber: "TEST-0001",
    date: new Date().toISOString(),
    cashierName: "Test",
    customerName: null,
    tableNo: "5",
    items: [
      { name: "Mango Malba", quantity: 2, unitPrice: 110, gstRate: 0, discount: 0, taxableAmount: 220, cgst: 0, sgst: 0, igst: 0, lineTotal: 220 },
      { name: "Chicken Cheesy Wrap", quantity: 1, unitPrice: 160, gstRate: 0, discount: 0, taxableAmount: 160, cgst: 0, sgst: 0, igst: 0, lineTotal: 160 },
    ],
    subtotal: 380, itemDiscount: 0, billDiscount: 0, taxableAmount: 380, cgst: 0, sgst: 0, igst: 0, roundOff: 0,
    grandTotal: 380,
    payments: [{ method: "cash", amount: 380 }],
    shop: { name: shopName || "Malba Ree", address: "", phone: "", email: "", gstin: "", state: "", pincode: "" },
    footer: "*** TEST PRINT ***",
  };
  return buildSlipBlocks(fake, { cols, kot });
}

/** Plain text (formatting dropped) for the local print bridge and simple previews. */
export function blocksToPlainText(blocks: Block[], cols: number): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "text") {
      const width = b.size === "big" ? Math.floor(cols / 2) : cols;
      const text = clip(b.text, width);
      const space = Math.max(0, cols - text.length);
      const left = b.align === "center" ? Math.floor(space / 2) : b.align === "right" ? space : 0;
      out.push(" ".repeat(left) + text);
    } else if (b.kind === "rule") out.push((b.char ?? "-").repeat(cols));
    else if (b.kind === "feed") for (let i = 0; i < b.lines; i++) out.push("");
  }
  return out.join("\n") + "\n";
}
