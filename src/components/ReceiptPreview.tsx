import type { CSSProperties } from "react";
import type { Block } from "@/lib/receiptLayout";

const isSafeLogo = (url: string) => /^data:image\/(png|jpe?g|webp);base64,/i.test(url);

/** On-screen version of exactly what will be printed (bill, gap, KOT tear line, KOT). */
export function ReceiptPreview({ blocks, cols }: { blocks: Block[]; cols: number }) {
  const base = 11; // px
  return (
    <div
      className="mx-auto max-h-[55vh] overflow-auto rounded-md border border-border bg-white p-3 text-black shadow-inner"
      style={{ width: `calc(${cols}ch * 0.62 * ${base / 11} + 1.5rem)`, maxWidth: "100%", minWidth: "17rem" }}
    >
      <div style={{ fontFamily: '"Courier New", ui-monospace, monospace', fontSize: base, lineHeight: 1.35 }}>
        {blocks.map((b, i) => {
          if (b.kind === "text") {
            const style: CSSProperties = {
              whiteSpace: "pre",
              textAlign: b.align ?? "left",
              fontWeight: b.bold ? 800 : 600,
            };
            if (b.size === "big") style.fontSize = base * 2;
            if (b.size === "tall") {
              style.transform = "scaleY(1.9)";
              style.transformOrigin = "left top";
              style.marginBottom = `${base * 1.35 * 0.9}px`;
            }
            return (
              <div key={i} style={style}>
                {b.text || "\u00a0"}
              </div>
            );
          }
          if (b.kind === "rule") return <div key={i} style={{ whiteSpace: "pre", overflow: "hidden" }}>{(b.char ?? "-").repeat(cols)}</div>;
          if (b.kind === "feed") return <div key={i} style={{ height: `${b.lines * base * 1.35}px` }} />;
          if (b.kind === "logo" && isSafeLogo(b.src))
            return (
              <div key={i} className="py-1 text-center">
                <img src={b.src} alt="Logo" className="mx-auto max-h-14 max-w-[55%] object-contain" />
              </div>
            );
          if (b.kind === "cut")
            return (
              <div key={i} className="mt-2 border-t border-dashed border-neutral-400 pt-1 text-center text-[9px] text-neutral-500">
                ✂ cut
              </div>
            );
          return null;
        })}
      </div>
    </div>
  );
}
