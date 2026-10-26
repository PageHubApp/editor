/** Pure crop geometry: ratio presets, the initial box, clamping, and percent ⇄ pixel conversion. */

import { clamp } from "../../../primitives/math";

/** A crop rectangle in the source image's natural pixels. */
export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NaturalSize {
  width: number;
  height: number;
}

/** A crop as a percentage of the image (what the stage renders and emits). */
export interface PercentCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropRatioPreset {
  key: string;
  label: string;
  /** width / height; null = free; "original" = the image's own ratio. */
  ratio: number | null | "original";
}

export const CROP_RATIO_PRESETS: CropRatioPreset[] = [
  { key: "free", label: "Free", ratio: null },
  { key: "original", label: "Original", ratio: "original" },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:5", label: "4:5", ratio: 4 / 5 },
  { key: "3:2", label: "3:2", ratio: 3 / 2 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "9:16", label: "9:16", ratio: 9 / 16 },
];

/** The preset's ratio as a number for this image, or null for free. */
export function resolveRatio(preset: CropRatioPreset, natural: NaturalSize): number | null {
  if (preset.ratio === "original") return natural.width / natural.height;
  return preset.ratio;
}

/** The largest crop at `ratio` centred on the image; the whole image when free. */
export function initialCrop(natural: NaturalSize, ratio: number | null): PixelCrop {
  if (!ratio) return { x: 0, y: 0, width: natural.width, height: natural.height };
  let width = natural.width;
  let height = width / ratio;
  if (height > natural.height) {
    height = natural.height;
    width = height * ratio;
  }
  return {
    x: Math.round((natural.width - width) / 2),
    y: Math.round((natural.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Whole pixels, at least `minSize` on each side, never past the image's edges.
 * Size is clamped first, then the position is pulled back inside, so a crop
 * dragged off an edge keeps its size instead of shrinking.
 */
export function clampCrop(crop: PixelCrop, natural: NaturalSize, minSize = 1): PixelCrop {
  const maxW = Math.max(1, Math.floor(natural.width));
  const maxH = Math.max(1, Math.floor(natural.height));
  const width = clamp(Math.round(crop.width), Math.min(minSize, maxW), maxW);
  const height = clamp(Math.round(crop.height), Math.min(minSize, maxH), maxH);
  return {
    x: clamp(Math.round(crop.x), 0, maxW - width),
    y: clamp(Math.round(crop.y), 0, maxH - height),
    width,
    height,
  };
}

/** True when the crop covers the whole image (saving it would change nothing). */
export function isFullImageCrop(crop: PixelCrop, natural: NaturalSize): boolean {
  const c = clampCrop(crop, natural);
  return (
    c.x === 0 &&
    c.y === 0 &&
    c.width === Math.floor(natural.width) &&
    c.height === Math.floor(natural.height)
  );
}

/** "1600 × 900 px" — the size of the file the crop will produce. */
export function cropSizeLabel(crop: Pick<PixelCrop, "width" | "height">): string {
  return `${Math.round(crop.width)} × ${Math.round(crop.height)} px`;
}

/** Natural-pixel crop → percent of the image, for display. */
export function toPercent(crop: PixelCrop, natural: NaturalSize): PercentCrop {
  return {
    x: (crop.x / natural.width) * 100,
    y: (crop.y / natural.height) * 100,
    width: (crop.width / natural.width) * 100,
    height: (crop.height / natural.height) * 100,
  };
}

/** Percent of the image → natural pixels, whole and inside the image. */
export function toPixels(crop: PercentCrop, natural: NaturalSize, minSize = 1): PixelCrop {
  return clampCrop(
    {
      x: (crop.x / 100) * natural.width,
      y: (crop.y / 100) * natural.height,
      width: (crop.width / 100) * natural.width,
      height: (crop.height / 100) * natural.height,
    },
    natural,
    minSize
  );
}
