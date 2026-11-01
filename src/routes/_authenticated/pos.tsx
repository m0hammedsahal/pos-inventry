import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ChevronUp, Minus, Plus, PlusCircle, Printer, Search, ShoppingBag, Trash2, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { explainError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useAuthUser";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { generateItemCode } from "@/lib/cafe";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cachedQuery } from "@/services/offlineCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { computeBill, type CartLineInput, type DiscountType } from "@/lib/tax";
import { formatCurrency } from "@/lib/format";
import { fetchSettings, readCachedSettings } from "@/services/settingsService";
import { buildSlipBlocks, columnsFor } from "@/lib/receiptLayout";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { paperWidth, printSlip } from "@/services/printing";
import type { PaymentMethod, PaymentSplit, ReceiptData } from "@/types";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "Billing Counter — Malba Ree" },
      { name: "description", content: "Fast GST billing counter: pick menu items, split payments and print receipts." },
      { property: "og:title", content: "Billing Counter — Malba Ree" },
      { property: "og:description", content: "Fast GST billing counter for Indian retail shops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PosPage,
});

interface CartRow extends CartLineInput {
  key: string;
}

function PosPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyProfile();
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartRow[]>([]);
  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>("amount");
  const [billDiscountValue, setBillDiscountValue] = useState(0);
  const [payments, setPayments] = useState<{ method: PaymentMethod; amount: number; reference?: string }[]>([]);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const online = useOnlineStatus();
  const isMobile = useIsMobile();
  const [orderOpen, setOrderOpen] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [quickOpen, setQuickOpen] = useState(false);
  const [tableNo, setTableNo] = useState("");
  const [quick, setQuick] = useState({ name: "", price: "", gst: "5", categoryId: "none" });

  const { data: settings = readCachedSettings() } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pos-products"],
    queryFn: () => cachedQuery("pos-products", async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data;
    }),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: () => cachedQuery("pos-customers", async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, state, outstanding, credit_limit, gstin")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["pos-categories"],
    queryFn: () =>
      cachedQuery("pos-categories", async () => {
        const { data, error } = await supabase.from("categories").select("id, name").order("name");
        if (error) throw error;
        return data;
      }),
  });

  // Menu tiles: filtered by the chosen category and whatever is typed / scanned.
  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category_id !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, term, category]);

  const qtyById = useMemo(() => new Map(cart.map((l) => [l.productId, l.quantity])), [cart]);
  const itemCount = cart.reduce((n, l) => n + l.quantity, 0);

  const customer = customers.find((c) => c.id === customerId) ?? null;

  const bill = useMemo(
    () =>
      computeBill(
        cart,
        { type: billDiscountType, value: billDiscountValue },
        { shopState: settings.tax.shopState, customerState: customer?.state ?? settings.tax.shopState },
      ),
    [cart, billDiscountType, billDiscountValue, settings.tax.shopState, customer?.state],
  );

  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = Math.round((bill.grandTotal - paid) * 100) / 100;

  function addProduct(p: (typeof products)[number]) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key: `${p.id}-${Date.now()}`,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          hsnCode: p.hsn_code,
          unit: p.unit,
          quantity: 1,
          unitPrice: Number(p.selling_price),
          purchasePrice: Number(p.purchase_price),
          gstRate: Number(p.gst_rate),
          priceIncludesTax: true,
          discountType: "amount",
          discountValue: 0,
        },
      ];
    });
    setTerm("");
    if (!isMobile) searchRef.current?.focus();
  }

  function updateRow(key: string, patch: Partial<CartRow>) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function resetBill() {
    setCart([]);
    setPayments([]);
    setBillDiscountValue(0);
    setCustomerId("walk-in");
    setTableNo("");
  }

  const checkout = useMutation({
    mutationFn: async () => {
      const entered = payments.filter((p) => Number(p.amount) > 0);
      const list: PaymentSplit[] = entered.length
        ? entered.map((p) => ({ method: p.method, amount: Number(p.amount), ...(p.reference ? { reference: p.reference } : {}) }))
        : [{ method: "cash" as PaymentMethod, amount: bill.grandTotal }];
      const primary = list[0]?.method ?? "cash";
      const payload = {
        customerId: customerId === "walk-in" ? null : customerId,
        customerName: customer?.name ?? "Walk-in",
        notes: tableNo.trim() ? `Table ${tableNo.trim()}` : null,
        cashierName: me?.fullName ?? "Cashier",
        paymentMethod: list.some((p) => p.method === "credit") ? "credit" : primary,
        items: bill.lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          sku: l.sku,
          hsnCode: l.hsnCode,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          purchasePrice: l.purchasePrice ?? 0,
          discount: l.discount,
          gstRate: l.gstRate,
          taxableAmount: l.taxableAmount,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
          lineTotal: l.lineTotal,
        })),
        payments: list.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
        totals: {
          subtotal: bill.subtotal,
          itemDiscount: bill.itemDiscount,
          billDiscount: bill.billDiscount,
          taxableAmount: bill.taxableAmount,
          cgst: bill.cgst,
          sgst: bill.sgst,
          igst: bill.igst,
          roundOff: bill.roundOff,
          grandTotal: bill.grandTotal,
          costTotal: bill.costTotal,
        },
      };
      const { data, error } = await supabase.rpc("create_sale", { payload: payload as never });
      if (error) throw error;
      return { result: data as { id: string; invoice_number: string }, list };
    },
    onSuccess: ({ result, list }) => {
      const data: ReceiptData = {
        invoiceNumber: result.invoice_number,
        date: new Date().toISOString(),
        cashierName: me?.fullName ?? "Cashier",
        customerName: customer?.name ?? null,
        customerGstin: customer?.gstin ?? null,
        tableNo: tableNo.trim() || null,
        items: bill.lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unit: l.unit ?? null,
          unitPrice: l.unitPrice,
          hsnCode: l.hsnCode ?? null,
          gstRate: l.gstRate,
          discount: l.discount,
          taxableAmount: l.taxableAmount,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
          lineTotal: l.lineTotal,
        })),
        subtotal: bill.subtotal,
        itemDiscount: bill.itemDiscount,
        billDiscount: bill.billDiscount,
        taxableAmount: bill.taxableAmount,
        cgst: bill.cgst,
        sgst: bill.sgst,
        igst: bill.igst,
        roundOff: bill.roundOff,
        grandTotal: bill.grandTotal,
        payments: list,
        shop: settings.shop,
        footer: settings.invoice.footer,
      };
      setReceipt(data);
      toast.success(`Bill ${result.invoice_number} saved`);
      if (settings.printer.autoPrint) {
        void printSlip(data, settings).then((res) => {
          if (res.ok) toast.success(res.message);
          else toast.error(res.message);
        });
      }
      void queryClient.invalidateQueries();
      resetBill();
      setOrderOpen(false);
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  function addPayment(method: PaymentMethod) {
    setPayments((prev) => {
      const outstanding = Math.max(
        0,
        Math.round((bill.grandTotal - prev.reduce((s, p) => s + (Number(p.amount) || 0), 0)) * 100) / 100,
      );
      const existing = prev.findIndex((p) => p.method === method);
      if (existing >= 0) {
        return prev.map((p, i) =>
          i === existing
            ? { ...p, amount: Math.round(((Number(p.amount) || 0) + outstanding) * 100) / 100 }
            : p,
        );
      }
      return [...prev, { method, amount: outstanding }];
    });
  }

  const quickAdd = useMutation({
    mutationFn: async () => {
      const price = Number(quick.price);
      if (!quick.name.trim()) throw new Error("Enter the item name");
      if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid price");
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: quick.name.trim(),
          sku: generateItemCode(),
          category_id: quick.categoryId === "none" ? null : quick.categoryId,
          unit: "plate",
          gst_rate: Number(quick.gst) || 0,
          selling_price: price,
          mrp: price,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (product) => {
      toast.success(`${product.name} added to the menu`);
      setQuickOpen(false);
      setQuick({ name: "", price: "", gst: quick.gst, categoryId: quick.categoryId });
      void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      addProduct(product);
    },
    onError: (e: unknown) => toast.error(explainError(e)),
  });

  const canComplete =
    cart.length > 0 &&
    !checkout.isPending &&
    !(payments.some((p) => Number(p.amount) > 0) && balance !== 0);

  useBarcodeScanner((code) => {
    const match = products.find(
      (p) => (p.barcode ?? "").toLowerCase() === code.toLowerCase() || p.sku.toLowerCase() === code.toLowerCase(),
    );
    if (match) {
      addProduct(match);
      toast.success(`${match.name} added`);
    } else {
      setTerm(code);
      toast.error(`No item found for ${code}`);
    }
  });

  useHotkeys({
    f2: () => {
      setTerm("");
      searchRef.current?.focus();
    },
    f4: () => addPayment("cash"),
    f6: () => addPayment("upi"),
    f9: () => {
      if (canComplete) checkout.mutate();
    },
    escape: () => {
      if (receipt) setReceipt(null);
      else if (term) setTerm("");
      else if (cart.length) resetBill();
    },
  });

  const orderPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShoppingBag className="size-4 text-primary" />
          Current order
          {cart.length > 0 && (
            <Badge variant="secondary">
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </Badge>
          )}
        </h2>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={resetBill}>
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {bill.lines.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Tap menu items to add them here.
          </p>
        )}
        {bill.lines.map((line) => {
          const row = cart.find((c) => c.productId === line.productId);
          if (!row) return null;
          return (
            <div key={row.key} className="rounded-lg border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-tight">{line.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setCart((prev) => prev.filter((l) => l.key !== row.key))}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      row.quantity <= 1
                        ? setCart((prev) => prev.filter((l) => l.key !== row.key))
                        : updateRow(row.key, { quantity: row.quantity - 1 })
                    }
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    className="h-8 w-14 text-center"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8"
                    aria-label="Increase quantity"
                    onClick={() => updateRow(row.key, { quantity: row.quantity + 1 })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <span className="font-mono text-sm font-semibold">{formatCurrency(line.lineTotal)}</span>
              </div>
              <details className="mt-1.5 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  {formatCurrency(row.unitPrice)} each · GST {line.gstRate}% — change rate or discount
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span>Rate (₹)</span>
                    <Input
                      className="h-8"
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(row.key, { unitPrice: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span>Discount (₹)</span>
                    <Input
                      className="h-8"
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={row.discountValue ?? 0}
                      onChange={(e) => updateRow(row.key, { discountValue: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
              </details>
            </div>
          );
        })}
      </div>

          <div className="space-y-1">
            <Label>Table / token no. (shown on bill and KOT)</Label>
            <Input
              value={tableNo}
              maxLength={12}
              placeholder="e.g. 5 or T12"
              onChange={(e) => setTableNo(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walk-in">Walk-in customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.phone ? `· ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customer && Number(customer.outstanding) > 0 && (
              <p className="text-xs text-warning-foreground">
                Outstanding: {formatCurrency(Number(customer.outstanding))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Bill discount</Label>
              <Input
                value={billDiscountValue}
                onChange={(e) => setBillDiscountValue(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={billDiscountType} onValueChange={(v) => setBillDiscountType(v as DiscountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">₹ Amount</SelectItem>
                  <SelectItem value="percent">% Percent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatCurrency(bill.subtotal)} />
            {bill.itemDiscount > 0 && <Row label="Item discount" value={`-${formatCurrency(bill.itemDiscount)}`} />}
            {bill.billDiscount > 0 && <Row label="Bill discount" value={`-${formatCurrency(bill.billDiscount)}`} />}
            <Row label="Taxable" value={formatCurrency(bill.taxableAmount)} />
            {bill.interState ? (
              <Row label="IGST" value={formatCurrency(bill.igst)} />
            ) : (
              <>
                <Row label="CGST" value={formatCurrency(bill.cgst)} />
                <Row label="SGST" value={formatCurrency(bill.sgst)} />
              </>
            )}
            {bill.roundOff !== 0 && <Row label="Round off" value={formatCurrency(bill.roundOff)} />}
            <div className="flex items-center justify-between border-t border-border pt-2 text-lg font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(bill.grandTotal)}</span>
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <Label>Payment</Label>
              <span className="text-xs text-muted-foreground">
                Balance {formatCurrency(payments.length ? balance : 0)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["cash", "upi", "card", "credit"] as PaymentMethod[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  className="capitalize"
                  onClick={() => addPayment(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
            {payments.map((p, i) => (
              <div key={`${p.method}-${i}`} className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {p.method}
                </Badge>
                <Input
                  className="h-8"
                  value={p.amount}
                  onChange={(e) =>
                    setPayments((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, amount: Number(e.target.value) || 0 } : x)),
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            className="h-12 w-full text-base"
            disabled={!canComplete}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending ? "Saving…" : `Complete sale · ${formatCurrency(bill.grandTotal)}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No payment rows selected = full cash payment.
          </p>
          <div className="hidden grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground lg:grid">
            <Shortcut keys="F2" label="Search item" />
            <Shortcut keys="F4" label="Cash payment" />
            <Shortcut keys="F6" label="UPI payment" />
            <Shortcut keys="F9" label="Complete sale" />
            <Shortcut keys="Esc" label="Clear bill" />
            <Shortcut keys="Scan" label="Auto-adds item" />
          </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Billing Counter"
        description="Tap menu items to build the order, take payment and print."
        actions={
          <div className="flex items-center gap-2">
            {!online && (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="size-3" /> Offline — showing saved list
              </Badge>
            )}
            <Button variant="outline" onClick={resetBill} disabled={!cart.length} className="hidden sm:inline-flex">
              Clear bill
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 p-3 pb-28 sm:p-4 lg:grid-cols-[1.5fr_1fr] lg:pb-4">
        {/* Menu */}
        <div className="min-w-0 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus={!isMobile}
                className="pl-9"
                placeholder="Search menu or scan barcode"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && visible[0]) addProduct(visible[0]);
                }}
              />
            </div>
            {me?.isManager && (
              <Button variant="outline" onClick={() => setQuickOpen(true)}>
                <PlusCircle className="size-4" />
                <span className="hidden sm:inline">New item</span>
              </Button>
            )}
          </div>

          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            {[{ id: "all", name: "All" }, ...categories].map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={category === c.id ? "default" : "outline"}
                className="shrink-0 rounded-full"
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const inCart = qtyById.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className={
                    "relative flex min-h-24 flex-col justify-between rounded-xl border bg-card p-3 text-left shadow-card transition active:scale-95 " +
                    (inCart > 0 ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50")
                  }
                >
                  {inCart > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {inCart}
                    </span>
                  )}
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</span>
                  <span className="mt-2 font-mono text-sm font-semibold text-primary">
                    {formatCurrency(Number(p.selling_price))}
                  </span>
                </button>
              );
            })}
            {!visible.length && (
              <p className="col-span-full rounded-lg border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
                {products.length
                  ? "No menu item matches. Try another category or search."
                  : "Your menu is empty. Use New item to add your first dish or drink."}
              </p>
            )}
          </div>
        </div>

        {/* Order (desktop) */}
        {!isMobile && (
          <Card className="h-fit max-h-[calc(100vh-2rem)] overflow-y-auto p-4 lg:sticky lg:top-4">{orderPanel}</Card>
        )}
      </div>

      {/* Order (phone): summary bar + slide-up sheet */}
      {isMobile && (
        <>
          <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-30 px-3 pb-2">
            <Button
              className="h-12 w-full justify-between rounded-xl text-base shadow-panel"
              disabled={!cart.length}
              onClick={() => setOrderOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="size-4" />
                {cart.length ? `${formatNumberShort(itemCount)} item${itemCount === 1 ? "" : "s"}` : "No items yet"}
              </span>
              <span className="flex items-center gap-1 font-mono">
                {formatCurrency(bill.grandTotal)} <ChevronUp className="size-4" />
              </span>
            </Button>
          </div>
          <Sheet open={orderOpen} onOpenChange={setOrderOpen}>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
              <SheetTitle className="sr-only">Current order</SheetTitle>
              <SheetDescription className="sr-only">Review items, take payment and complete the sale</SheetDescription>
              {orderPanel}
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Quick add a menu item */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a menu item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                autoFocus
                value={quick.name}
                placeholder="e.g. Cold Coffee"
                onChange={(e) => setQuick({ ...quick, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Price (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={quick.price}
                  onChange={(e) => setQuick({ ...quick, price: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>GST %</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={quick.gst}
                  onChange={(e) => setQuick({ ...quick, gst: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={quick.categoryId} onValueChange={(v) => setQuick({ ...quick, categoryId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!quick.name.trim() || !quick.price || quickAdd.isPending}
              onClick={() => quickAdd.mutate()}
            >
              Add to menu and to this order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receipt {receipt?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {receipt && (
            <>
              <ReceiptPreview
                cols={columnsFor(paperWidth(settings))}
                blocks={buildSlipBlocks(receipt, {
                  cols: columnsFor(paperWidth(settings)),
                  kot: settings.printer.printKot !== false,
                })}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={async () => {
                    const res = await printSlip(receipt, settings);
                    if (res.ok && !res.usedFallback) toast.success(res.message);
                    else if (res.ok) toast.message(res.message);
                    else toast.error(res.message);
                  }}
                >
                  <Printer className="size-4" /> Print bill{settings.printer.printKot !== false ? " + KOT" : ""}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setReceipt(null)}>
                  New bill
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const formatNumberShort = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
        {keys}
      </kbd>
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
