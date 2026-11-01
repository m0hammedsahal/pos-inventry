import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;
export type Category = Tables<"categories">;
export type Customer = Tables<"customers">;
export type Supplier = Tables<"suppliers">;
export type Invoice = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type Payment = Tables<"payments">;
export type StockMovement = Tables<"stock_movements">;
export type Expense = Tables<"expenses">;
export type Purchase = Tables<"purchases">;
export type PurchaseItem = Tables<"purchase_items">;
export type SalesReturn = Tables<"sales_returns">;
export type Profile = Tables<"profiles">;
export type KitchenItem = Tables<"kitchen_items">;
export type KitchenStockMovement = Tables<"kitchen_stock_movements">;
export type ExpenseCategory = Tables<"expense_categories">;
export type StaffMember = Tables<"staff_members">;
export type StaffAttendance = Tables<"staff_attendance">;

export type AttendanceStatus = "full_day" | "half_day";

export type AppRole = "admin" | "manager" | "cashier";

export type PaymentMethod = "cash" | "upi" | "card" | "credit";

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface ShopSettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  pincode: string;
  logoUrl?: string;
}

export interface InvoiceSettings {
  prefix: string;
  nextNumber: number;
  receiptWidth: "58" | "80";
  footer: string;
  showGst: boolean;
}

export interface TaxSettings {
  defaultGstRate: number;
  shopState: string;
}

export interface PosSettings {
  maxCashierDiscountPercent: number;
  allowNegativeStock: boolean;
}

export interface PrinterSettings {
  /** bluetooth = Web Bluetooth (phone/tablet/PC), thermal = local print bridge, browser = device print dialog */
  type: "bluetooth" | "thermal" | "browser";
  width: "58" | "80";
  /** Only used by the local print bridge */
  connection: "usb" | "bluetooth" | "network";
  name: string;
  bridgeUrl: string;
  /** Print the Kitchen Order Ticket on the same slip, below the bill */
  printKot?: boolean;
  /** Print as soon as a sale is completed */
  autoPrint?: boolean;
}

export interface AllSettings {
  shop: ShopSettings;
  invoice: InvoiceSettings;
  tax: TaxSettings;
  pos: PosSettings;
  printer: PrinterSettings;
}

export interface ReceiptData {
  invoiceNumber: string;
  date: string;
  cashierName: string;
  customerName?: string | null;
  customerGstin?: string | null;
  /** Table / token number, shown on the bill and the KOT */
  tableNo?: string | null;
  items: {
    name: string;
    quantity: number;
    unit?: string | null;
    unitPrice: number;
    hsnCode?: string | null;
    gstRate: number;
    discount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    lineTotal: number;
  }[];
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  grandTotal: number;
  payments: PaymentSplit[];
  shop: ShopSettings;
  footer: string;
}
