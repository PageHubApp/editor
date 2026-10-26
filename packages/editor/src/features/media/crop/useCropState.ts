/**
 * Loads the full-size original's dimensions and holds the crop. The crop is kept as a percent of
 * the image so the stage can resize freely; `pixelCrop` is the same box in the natural pixels of
 * `cropSourceUrl(item)`, the image `buildCroppedFile` reloads. `unchanged` is true while the crop
 * is the whole image (saving it would change nothing).
 */
import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "@pagehub/engine/host";
import {
  CROP_RATIO_PRESETS,
  initialCrop,
  isFullImageCrop,
  resolveRatio,
  toPercent,
  toPixels,
  type NaturalSize,
  type PercentCrop,
} from "./cropMath";
import { cropSourceUrl } from "./cropSave";

export function useCropState(item: MediaItem | null) {
  const src = cropSourceUrl(item);
  const hasItem = !!item;
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ratioKey, setRatioKey] = useState(CROP_RATIO_PRESETS[0]!.key);
  const [crop, setCrop] = useState<PercentCrop | undefined>();

  useEffect(() => {
    // Hosts clear `item` while the dialog fades out; keep what's on screen.
    if (!hasItem) return;
    setNatural(null);
    setCrop(undefined);
    setRatioKey(CROP_RATIO_PRESETS[0]!.key);
    setLoadFailed(!src);
    if (!src) return;

    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!live) return;
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setNatural(size);
      setCrop(toPercent(initialCrop(size, null), size));
    };
    img.onerror = () => {
      if (live) setLoadFailed(true);
    };
    img.src = src;
    return () => {
      live = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src, hasItem]);

  const preset = CROP_RATIO_PRESETS.find(p => p.key === ratioKey) ?? CROP_RATIO_PRESETS[0]!;
  const aspect = natural ? (resolveRatio(preset, natural) ?? undefined) : undefined;

  const selectRatio = useCallback(
    (key: string) => {
      const next = CROP_RATIO_PRESETS.find(p => p.key === key);
      if (!next || !natural) return;
      setRatioKey(key);
      setCrop(toPercent(initialCrop(natural, resolveRatio(next, natural)), natural));
    },
    [natural]
  );

  const pixelCrop = natural && crop ? toPixels(crop, natural) : null;
  const unchanged = !pixelCrop || !natural || isFullImageCrop(pixelCrop, natural);

  return { src, natural, loadFailed, crop, setCrop, aspect, ratioKey, selectRatio, pixelCrop, unchanged };
}
