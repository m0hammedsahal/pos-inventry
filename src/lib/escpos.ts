/**
 * ESC/POS encoder: turns the receipt layout into the byte stream a thermal
 * printer understands (works with standard 58 mm and 80 mm Bluetooth printers).
 */
import type { Block, TextSize } from "@/lib/receiptLayout";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Printers only understand a code page, so keep to plain ASCII. */
export function toAscii(text: string): string {
  return text
    .replace(/₹/g, "Rs")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7e]/g, "?");
}

const SIZE_BYTE: Record<TextSize, number> = { normal: 0x00, tall: 0x01, big: 0x11 };

/** 1-bit raster of the logo, ready for GS v 0. */
export interface Raster {
  width: number; // dots
  height: number; // dots
  data: Uint8Array; // (ceil(width/8) * height) bytes, MSB first, 1 = black
}

/**
 * Scales a logo down so it prints clean without wasting paper, and converts it
 * to black and white. `maxWidthDots` is the logo's width on the paper
 * (58 mm paper = 384 dots, 80 mm = 576 dots).
 */
export async function logoToRaster(src: string, maxWidthDots: number, maxHeightDots: number): Promise<Raster | null> {
  if (typeof document === "undefined") return null;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = src;
  });
  if (!img || !img.width || !img.height) return null;

  const scale = Math.min(maxWidthDots / img.width, maxHeightDots / img.height, 1);
  const width = Math.max(8, Math.round((img.width * scale) / 8) * 8); // whole bytes per row
  const height = Math.max(1, Math.round(img.height * (width / img.width)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = width / 8;
  const out = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3]! / 255;
      // luminance over white, so transparent areas stay white
      const lum = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) * alpha + 255 * (1 - alpha);
      if (lum < 150) out[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data: out };
}

export interface EncodeOptions {
  cols: number;
  widthMm: 58 | 80;
  /** Pre-rendered logos keyed by the block's src (built with logoToRaster) */
  logos?: Map<string, Raster | null>;
}

/** Layout -> ESC/POS bytes. */
export function encodeBlocks(blocks: Block[], opts: EncodeOptions): Uint8Array {
  const out: number[] = [];
  const push = (...bytes: number[]) => out.push(...bytes);
  const pushText = (text: string) => {
    const ascii = toAscii(text);
    for (let i = 0; i < ascii.length; i++) out.push(ascii.charCodeAt(i));
  };

  push(ESC, 0x40); // initialise
  push(ESC, 0x74, 0x00); // code page 0

  for (const b of blocks) {
    if (b.kind === "text") {
      const align = b.align === "center" ? 1 : b.align === "right" ? 2 : 0;
      const size = b.size ?? "normal";
      const maxCols = size === "big" ? Math.floor(opts.cols / 2) : opts.cols;
      push(ESC, 0x61, align);
      push(ESC, 0x45, b.bold ? 1 : 0);
      push(GS, 0x21, SIZE_BYTE[size]);
      pushText(b.text.slice(0, maxCols));
      push(LF);
      push(GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00); // reset
    } else if (b.kind === "rule") {
      push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0);
      pushText((b.char ?? "-").repeat(opts.cols));
      push(LF);
    } else if (b.kind === "feed") {
      for (let i = 0; i < b.lines; i++) push(LF);
    } else if (b.kind === "logo") {
      const raster = opts.logos?.get(b.src);
      if (raster) {
        const bytesPerRow = raster.width / 8;
        push(ESC, 0x61, 1); // centre
        // GS v 0 m xL xH yL yH d1...dk  (print raster bit image)
        push(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, raster.height & 0xff, (raster.height >> 8) & 0xff);
        for (let i = 0; i < raster.data.length; i++) out.push(raster.data[i]!);
        push(LF, ESC, 0x61, 0);
      }
    } else if (b.kind === "cut") {
      push(GS, 0x56, 0x42, 0x00); // feed to cutting position and partial cut (ignored by printers without a cutter)
    }
  }
  return Uint8Array.from(out);
}

/** Logo size on the paper: slightly smaller than full width so it prints clean. */
export const logoBox = (widthMm: 58 | 80) =>
  widthMm === 80 ? { width: 288, height: 128 } : { width: 200, height: 110 };
