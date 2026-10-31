/**
 * Cafe logo handling. The uploaded image is scaled down in the browser and kept
 * as a data URL inside the `shop` settings row, so no storage bucket is needed
 * and the logo is available offline together with the rest of the settings.
 */

export const LOGO_MAX_WIDTH = 384; // dots of a 58mm thermal printer
export const LOGO_MAX_HEIGHT = 160;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 350_000;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export const LOGO_ACCEPT = ACCEPTED.join(",");

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = src;
  });

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });

/** Validates, scales and compresses an uploaded logo; resolves to a data URL. */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Upload a PNG, JPG or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("The image is too large. Choose one under 4 MB.");

  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, LOGO_MAX_WIDTH / img.width, LOGO_MAX_HEIGHT / img.height);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot process images.");
  // White background so transparent logos print cleanly.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let out = canvas.toDataURL("image/png");
  if (out.length > MAX_OUTPUT_CHARS) out = canvas.toDataURL("image/jpeg", 0.85);
  if (out.length > MAX_OUTPUT_CHARS) out = canvas.toDataURL("image/jpeg", 0.6);
  if (out.length > MAX_OUTPUT_CHARS) throw new Error("This logo is too detailed. Try a simpler image.");
  return out;
}
