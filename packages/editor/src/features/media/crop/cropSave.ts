/**
 * Cuts the crop out of the full-size original on a canvas and returns a `File` for the host to
 * upload. This editor is host-agnostic — the media store's only write seam is `upload`, so a
 * crop is always saved as a copy (a new library item), routed through the host's `upload` handler
 * by the caller. `canReplaceInPlace` stays here so a future store seam can light the extra button.
 */
import { mediaKind, type MediaItem } from "@pagehub/engine/host";
import { clampCrop, type PixelCrop } from "./cropMath";

interface CropResult {
  file: File;
  width: number;
  height: number;
}

interface BuildCropArgs {
  item: MediaItem;
  /** In the natural pixels of the image at `cropSourceUrl(item)`. */
  crop: PixelCrop;
  /** Cancels the decode mid-flight. */
  signal?: AbortSignal;
}

/** JPEG quality for opaque crops. */
const CROP_JPEG_QUALITY = 0.92;

type CropOutputType = "image/png" | "image/jpeg";

/** URL of the image to crop from. The crop's pixel coordinates are in THIS image's natural size. */
export function cropSourceUrl(item: MediaItem | null): string | null {
  if (!item) return null;
  if (mediaKind(item.contentType) !== "image") return null;
  return item.url || null;
}

/** Only raster images can be cropped (not SVG, PDF, video…). */
export function canCrop(item: MediaItem | null): boolean {
  return !!cropSourceUrl(item);
}

/**
 * In-place replace keeps the item's id and points it at new bytes. This editor's `MediaStore` has
 * no seam for that (only name/alt/folder `update`), so it's always false today — the modal then
 * shows "Save as copy" only.
 */
export function canReplaceInPlace(_item: MediaItem | null): boolean {
  return false;
}

/** "beach-cropped.jpg" — the copy's file name; extension follows the output type. */
function cropFileName(item: MediaItem, type: CropOutputType): string {
  const base =
    String(item.name || item.id || "image")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "image";
  return `${base}-cropped.${type === "image/png" ? "png" : "jpg"}`;
}

/** Whether the source is a PNG we know of (stored content type, or the URL / name says so). */
function isPngSource(item: MediaItem): boolean {
  if (item.contentType === "image/png") return true;
  const named = [item.url, item.name].filter(Boolean).join(" ");
  return /\.png(\?|#|\s|$)/i.test(named);
}

/** Any pixel not fully opaque in RGBA data (`ImageData.data`). */
function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 255) return true;
  return false;
}

/**
 * PNG when the crop has see-through pixels or the source was a PNG (keeps flat graphics
 * lossless); JPEG otherwise.
 */
function cropOutputType(opts: { sourceIsPng: boolean; transparent: boolean }): CropOutputType {
  return opts.transparent || opts.sourceIsPng ? "image/png" : "image/jpeg";
}

/**
 * Cut `crop` out of the full-size original and return a `File` for the host to upload. Throws an
 * `Error` with a message to show the person.
 */
export async function buildCroppedFile({ item, crop, signal }: BuildCropArgs): Promise<CropResult> {
  const src = cropSourceUrl(item);
  if (!src) throw new Error("Only photos and images can be cropped.");

  const img = await loadImage(src, signal);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const area = clampCrop(crop, { width: img.naturalWidth, height: img.naturalHeight });

  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't crop this image. Try again.");
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

    let transparent: boolean;
    try {
      transparent = hasTransparency(ctx.getImageData(0, 0, area.width, area.height).data);
    } catch {
      throw new Error(
        "The site hosting this image doesn't allow editing it here. Download it, upload it to your library, and crop that."
      );
    }

    const type = cropOutputType({ sourceIsPng: isPngSource(item), transparent });
    const blob = await toBlob(canvas, type);
    const file = new File([blob], cropFileName(item, type), { type, lastModified: Date.now() });
    return { file, width: area.width, height: area.height };
  } finally {
    // Free the bitmap now; iOS Safari counts canvas memory until GC.
    canvas.width = 0;
    canvas.height = 0;
  }
}

function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          "Couldn't load the image to crop. The site hosting it may not allow editing it here — download it, upload it to your library, and crop that."
        )
      );
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: CropOutputType): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Your browser couldn't save the crop. Try again."))),
      type,
      type === "image/jpeg" ? CROP_JPEG_QUALITY : undefined
    )
  );
}
