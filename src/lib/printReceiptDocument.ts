/**
 * Browser printing for thermal receipts.
 *
 * The receipt is rendered into a hidden, isolated iframe that contains ONLY the
 * receipt text, then that iframe is printed. This is what makes printing work
 * on Android POS handhelds where popup windows are blocked and where
 * `window.print()` would print the whole application page instead.
 */

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isSafeLogo = (url: string | undefined | null): url is string => !!url && /^data:image\/(png|jpe?g|webp);base64,/i.test(url);

const documentHtml = (title: string, text: string, widthMm: number, logoUrl?: string | null): string => `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .logo { width: ${widthMm}mm; padding: 2mm 1mm 0; text-align: center; box-sizing: border-box; }
  .logo img { max-width: 100%; max-height: 28mm; object-fit: contain; filter: grayscale(1) contrast(1.4); }
  pre {
    margin: 0;
    padding: 2mm 1mm;
    width: ${widthMm}mm;
    font-family: "Courier New", "DejaVu Sans Mono", ui-monospace, monospace;
    font-size: ${widthMm >= 80 ? 14 : 13}px;
    font-weight: 700;
    letter-spacing: 0.2px;
    line-height: 1.35;
    color: #000;
    white-space: pre;
    -webkit-font-smoothing: none;
    font-smooth: never;
    text-rendering: geometricPrecision;
    -webkit-text-stroke: 0.28px #000;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
</style></head>
<body>${isSafeLogo(logoUrl) ? `<div class="logo"><img src="${logoUrl}" alt="" /></div>` : ""}<pre>${escapeHtml(text)}</pre></body></html>`;

/** Prints plain receipt text. Returns false when the browser blocked printing. */
export function printReceiptText(
  text: string,
  opts: { title?: string; widthMm?: 58 | 80; logoUrl?: string | null | undefined } = {},
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const title = opts.title ?? "Receipt";
  const widthMm = opts.widthMm ?? 58;
  const html = documentHtml(title, text, widthMm, opts.logoUrl);
  return printHtml(html);
}

/** Prints an HTML document through a hidden iframe (falls back to a popup). */
function printHtml(html: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const existing = document.getElementById("receipt-print-frame");
    if (existing) existing.remove();

    const frame = document.createElement("iframe");
    frame.id = "receipt-print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:400px;height:600px;border:0;visibility:hidden;";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      return printInPopup(html);
    }

    doc.open();
    doc.write(html);
    doc.close();

    const run = () => {
      try {
        win.focus();
        win.print();
      } catch {
        printInPopup(html);
      }
      // Keep the frame alive long enough for the print dialog to read it.
      window.setTimeout(() => frame.remove(), 60000);
    };

    // Wait for the logo (if any) to finish loading so it is part of the printout.
    const whenReady = () => {
      const img = doc.querySelector("img");
      if (img && !img.complete) {
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          window.setTimeout(run, 50);
        };
        img.addEventListener("load", go);
        img.addEventListener("error", go);
        window.setTimeout(go, 1500);
      } else {
        window.setTimeout(run, 50);
      }
    };

    if (doc.readyState === "complete") whenReady();
    else frame.onload = whenReady;

    return true;
  } catch {
    return printInPopup(html);
  }
}

function printInPopup(html: string): boolean {
  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 200);
  return true;
}

// ---------------------------------------------------------------------------
// Layout-based printing (bill + KOT with bold / large text and a smaller logo)
// ---------------------------------------------------------------------------
import type { Block } from "@/lib/receiptLayout";

function blocksHtml(blocks: Block[], widthMm: number, cols: number): string {
  const body = blocks
    .map((b) => {
      if (b.kind === "text") {
        const cls = ["ln", b.align === "center" ? "c" : b.align === "right" ? "r" : "", b.bold ? "b" : "", b.size ?? "normal"]
          .filter(Boolean)
          .join(" ");
        return `<div class="${cls}">${escapeHtml(b.text) || "&nbsp;"}</div>`;
      }
      if (b.kind === "rule") return `<div class="ln">${escapeHtml((b.char ?? "-").repeat(cols))}</div>`;
      if (b.kind === "feed") return `<div style="height:${b.lines * 1.35}em"></div>`;
      if (b.kind === "logo" && isSafeLogo(b.src)) return `<div class="logo"><img src="${b.src}" alt="" /></div>`;
      return "";
    })
    .join("\n");
  const font = widthMm >= 80 ? 10.8 : 10.5;
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Receipt</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .slip { width: ${widthMm}mm; box-sizing: border-box; padding: 2mm 2mm 4mm; color: #000;
    font-family: "Courier New", "DejaVu Sans Mono", ui-monospace, monospace; font-size: ${font}px; line-height: 1.35;
    print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .ln { white-space: pre; font-weight: 600; }
  .ln.b { font-weight: 800; }
  .ln.c { text-align: center; } .ln.r { text-align: right; }
  .ln.tall { transform: scaleY(2); transform-origin: left top; margin-bottom: 1.35em; font-weight: 800; }
  .ln.big { font-size: ${font * 2}px; line-height: 1.2; font-weight: 800; }
  .logo { text-align: center; padding: 1mm 0 2mm; }
  .logo img { max-width: ${widthMm >= 80 ? 48 : 52}%; max-height: 18mm; object-fit: contain; filter: grayscale(1) contrast(1.5); }
</style></head><body><div class="slip">${body}</div></body></html>`;
}

/** Prints the slip layout through the device print dialog. Returns false when the browser blocked it. */
export function printBlocks(blocks: Block[], opts: { widthMm: 58 | 80; cols: number }): boolean {
  return printHtml(blocksHtml(blocks, opts.widthMm, opts.cols));
}
