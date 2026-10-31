import type { ReceiptData } from "@/types";
import { formatCurrency, formatDateTime } from "./format";

const pad = (text: string, width: number) => text.slice(0, width).padEnd(width, " ");
const center = (text: string, width: number) => {
  const t = text.slice(0, width);
  const left = Math.max(0, Math.floor((width - t.length) / 2));
  return " ".repeat(left) + t;
};
const row = (left: string, right: string, width: number) =>
  pad(left, Math.max(0, width - right.length - 1)) + " " + right;

const amount = (v: number) => `Rs ${v.toFixed(2)}`;

/** Plain-text ESC/POS friendly receipt (32 cols for 58mm, 42 cols for 80mm). */
export function buildReceiptText(receipt: ReceiptData, width = 32): string {
  const line = "-".repeat(width);
  const out: string[] = [];
  out.push(center(receipt.shop.name.toUpperCase(), width));
  if (receipt.shop.address) out.push(center(receipt.shop.address, width));
  if (receipt.shop.phone) out.push(center(`Ph: ${receipt.shop.phone}`, width));
  if (receipt.shop.gstin) out.push(center(`GSTIN: ${receipt.shop.gstin}`, width));
  out.push(line);
  out.push(`Invoice: ${receipt.invoiceNumber}`);
  out.push(`Date   : ${formatDateTime(receipt.date)}`);
  out.push(`Cashier: ${receipt.cashierName}`);
  if (receipt.customerName) out.push(`Customer: ${receipt.customerName}`);
  out.push(line);
  out.push(row("Item", "Amount", width));
  out.push(line);
  for (const item of receipt.items) {
    out.push(item.name.slice(0, width));
    out.push(row(`  ${item.quantity} x ${item.unitPrice.toFixed(2)}`, amount(item.lineTotal), width));
    if (item.discount > 0) out.push(row("  Discount", `-${item.discount.toFixed(2)}`, width));
  }
  out.push(line);
  out.push(row("Subtotal", amount(receipt.subtotal), width));
  if (receipt.itemDiscount > 0) out.push(row("Item Discount", `-${receipt.itemDiscount.toFixed(2)}`, width));
  if (receipt.billDiscount > 0) out.push(row("Bill Discount", `-${receipt.billDiscount.toFixed(2)}`, width));
  out.push(row("Taxable", amount(receipt.taxableAmount), width));
  if (receipt.cgst > 0) out.push(row("CGST", amount(receipt.cgst), width));
  if (receipt.sgst > 0) out.push(row("SGST", amount(receipt.sgst), width));
  if (receipt.igst > 0) out.push(row("IGST", amount(receipt.igst), width));
  if (receipt.roundOff !== 0) out.push(row("Round Off", receipt.roundOff.toFixed(2), width));
  out.push(line);
  out.push(row("TOTAL", amount(receipt.grandTotal), width));
  out.push(line);
  for (const p of receipt.payments) {
    out.push(row(p.method.toUpperCase(), amount(p.amount), width));
    if (p.reference) out.push(`  Ref: ${p.reference}`);
  }
  out.push(line);
  out.push(center(receipt.footer || "Thank you!", width));
  out.push("");
  return out.join("\n");
}

export const receiptTotalsForDisplay = (receipt: ReceiptData) => ({
  subtotal: formatCurrency(receipt.subtotal),
  grandTotal: formatCurrency(receipt.grandTotal),
});
