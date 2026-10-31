import { addMoney, money, mulMoney, percentOf, roundOffTotal, subMoney } from "./money";

export type DiscountType = "percent" | "amount";

export interface CartLineInput {
  productId: string;
  name: string;
  sku?: string | null;
  hsnCode?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  purchasePrice?: number;
  gstRate: number;
  /** Price is inclusive of GST (typical Indian MRP retail). */
  priceIncludesTax?: boolean;
  discountType?: DiscountType;
  discountValue?: number;
  availableStock?: number;
}

export interface CartLineTotals {
  gross: number;
  discount: number;
  /** Amount charged to the customer for this line (tax inclusive). */
  lineTotal: number;
  taxableAmount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface BillTotals {
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  costTotal: number;
  interState: boolean;
  lines: (CartLineInput & CartLineTotals)[];
}

export interface TaxContext {
  /** Shop state, e.g. "Kerala". */
  shopState: string;
  /** Customer state; when different from shop state, IGST applies. */
  customerState?: string | null;
}

const splitTax = (taxAmount: number, interState: boolean) => {
  if (interState) return { cgst: 0, sgst: 0, igst: money(taxAmount) };
  const half = money(taxAmount / 2);
  return { cgst: half, sgst: subMoney(taxAmount, half), igst: 0 };
};

export const isInterState = (ctx: TaxContext): boolean => {
  const shop = (ctx.shopState || "").trim().toLowerCase();
  const cust = (ctx.customerState || "").trim().toLowerCase();
  if (!shop || !cust) return false;
  return shop !== cust;
};

export const lineDiscount = (line: CartLineInput): number => {
  const gross = mulMoney(line.unitPrice, line.quantity);
  const value = Number(line.discountValue) || 0;
  if (value <= 0) return 0;
  const raw = line.discountType === "percent" ? percentOf(gross, value) : money(value);
  return raw > gross ? gross : raw;
};

/** Compute one cart line, splitting tax out of a tax-inclusive price by default. */
export const computeLine = (
  line: CartLineInput,
  interState: boolean,
  billDiscountShare = 0,
): CartLineTotals => {
  const gross = mulMoney(line.unitPrice, line.quantity);
  const discount = lineDiscount(line);
  const lineTotal = subMoney(gross, discount);
  const netForTax = Math.max(0, subMoney(lineTotal, billDiscountShare));
  const rate = Number(line.gstRate) || 0;

  let taxableAmount: number;
  let taxAmount: number;
  if (line.priceIncludesTax === false) {
    taxableAmount = netForTax;
    taxAmount = percentOf(netForTax, rate);
  } else {
    taxableAmount = money(netForTax / (1 + rate / 100));
    taxAmount = subMoney(netForTax, taxableAmount);
  }

  return { gross, discount, lineTotal, taxableAmount, taxAmount, ...splitTax(taxAmount, interState) };
};

export interface BillDiscountInput {
  type: DiscountType;
  value: number;
}

/**
 * Single source of truth for bill maths — used by POS, invoice save, receipts and reports.
 */
export const computeBill = (
  lines: CartLineInput[],
  billDiscount: BillDiscountInput,
  ctx: TaxContext,
  options: { roundOff?: boolean } = {},
): BillTotals => {
  const interState = isInterState(ctx);

  const preliminary = lines.map((l) => computeLine(l, interState));
  const subtotal = addMoney(...preliminary.map((l) => l.gross), 0);
  const itemDiscount = addMoney(...preliminary.map((l) => l.discount), 0);
  const afterItemDiscount = addMoney(...preliminary.map((l) => l.lineTotal), 0);

  const rawBillDiscount =
    billDiscount.value > 0
      ? billDiscount.type === "percent"
        ? percentOf(afterItemDiscount, billDiscount.value)
        : money(billDiscount.value)
      : 0;
  const billDiscountAmount = rawBillDiscount > afterItemDiscount ? afterItemDiscount : rawBillDiscount;

  // Distribute the bill discount proportionally, giving the remainder to the last line.
  let remaining = billDiscountAmount;
  const shares = preliminary.map((l, idx) => {
    if (billDiscountAmount === 0 || afterItemDiscount === 0) return 0;
    if (idx === preliminary.length - 1) return remaining;
    const share = money((l.lineTotal / afterItemDiscount) * billDiscountAmount);
    remaining = subMoney(remaining, share);
    return share;
  });

  const computed = lines.map((l, i) => ({ ...l, ...computeLine(l, interState, shares[i] ?? 0) }));

  const taxableAmount = addMoney(...computed.map((l) => l.taxableAmount), 0);
  const cgst = addMoney(...computed.map((l) => l.cgst), 0);
  const sgst = addMoney(...computed.map((l) => l.sgst), 0);
  const igst = addMoney(...computed.map((l) => l.igst), 0);
  const taxTotal = addMoney(cgst, sgst, igst);
  const payable = addMoney(taxableAmount, taxTotal);
  const costTotal = addMoney(...computed.map((l) => mulMoney(l.purchasePrice ?? 0, l.quantity)), 0);

  const { total, roundOff } = options.roundOff === false
    ? { total: payable, roundOff: 0 }
    : roundOffTotal(payable);

  return {
    subtotal,
    itemDiscount,
    billDiscount: billDiscountAmount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    taxTotal,
    roundOff,
    grandTotal: total,
    costTotal,
    interState,
    lines: computed,
  };
};

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export const UNITS = [
  "piece",
  "kg",
  "gram",
  "litre",
  "millilitre",
  "box",
  "packet",
  "bottle",
  "dozen",
] as const;
