/**
 * The crop stage: fits the image into the space it's given and draws a draggable, resizable crop
 * box over it (rule-of-thirds guides, 8 handles + move). `react-image-crop` isn't a dependency
 * here, so the box is hand-rolled. Per the repo's drag rule, a gesture
 * attaches its move/up/cancel/blur listeners to `window` on pointerdown and detaches on end — React
 * event props strand a drag when the element re-renders or the pointer leaves the box.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../primitives/icons";
import {
  clampCrop,
  toPercent,
  toPixels,
  type NaturalSize,
  type PercentCrop,
  type PixelCrop,
} from "./cropMath";

interface CropStageProps {
  src: string | null;
  natural: NaturalSize | null;
  loadFailed: boolean;
  crop: PercentCrop | undefined;
  aspect: number | undefined;
  onChange: (crop: PercentCrop) => void;
  disabled?: boolean;
}

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";
const MIN_PX = 16;

/** The largest size with the image's proportions that fits inside `box`. */
function fitInside(natural: NaturalSize, box: NaturalSize): NaturalSize {
  const scale = Math.min(box.width / natural.width, box.height / natural.height, 1);
  return { width: Math.floor(natural.width * scale), height: Math.floor(natural.height * scale) };
}

/** Apply a drag on `handle` (in natural px) to the start box, keeping `aspect` when set. */
function resize(start: PixelCrop, handle: Handle, dx: number, dy: number, aspect?: number): PixelCrop {
  if (handle === "move") return { ...start, x: start.x + dx, y: start.y + dy };

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const corner = (west || east) && (north || south);

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (aspect) {
    if (corner) {
      // Anchor the opposite corner; follow whichever axis the cursor pulls furthest.
      const ax = west ? right : left;
      const ay = north ? bottom : top;
      const fx = (west ? left : right) + dx;
      const fy = (north ? top : bottom) + dy;
      let w = Math.abs(fx - ax);
      let h = Math.abs(fy - ay);
      if (w / aspect >= h) h = w / aspect;
      else w = h * aspect;
      left = west ? ax - w : ax;
      right = west ? ax : ax + w;
      top = north ? ay - h : ay;
      bottom = north ? ay : ay + h;
    } else if (west || east) {
      // One vertical edge grows; height follows the ratio, centred on the box.
      const cy = start.y + start.height / 2;
      if (west) left = start.x + dx;
      else right = right + dx;
      const w = Math.max(MIN_PX, right - left);
      const h = w / aspect;
      top = cy - h / 2;
      bottom = cy + h / 2;
    } else {
      const cx = start.x + start.width / 2;
      if (north) top = start.y + dy;
      else bottom = bottom + dy;
      const h = Math.max(MIN_PX, bottom - top);
      const w = h * aspect;
      left = cx - w / 2;
      right = cx + w / 2;
    }
  } else {
    if (west) left = start.x + dx;
    if (east) right = right + dx;
    if (north) top = start.y + dy;
    if (south) bottom = bottom + dy;
  }

  // Never let the dragged edge cross its opposite (no flip): hold the moved edge back by MIN_PX.
  if (right - left < MIN_PX) {
    if (west && !east) left = right - MIN_PX;
    else right = left + MIN_PX;
  }
  if (bottom - top < MIN_PX) {
    if (north && !south) top = bottom - MIN_PX;
    else bottom = top + MIN_PX;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const HANDLES: Array<{ id: Handle; css: string; cursor: string }> = [
  { id: "nw", css: "top-0 left-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { id: "n", css: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
  { id: "ne", css: "top-0 right-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { id: "e", css: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { id: "se", css: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  { id: "s", css: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
  { id: "sw", css: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
  { id: "w", css: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

/**
 * Fills the space it's given, fits the image inside, and draws the crop box. A skeleton holds the
 * area while the original loads; a failure state replaces it when the image can't be read.
 */
export function CropStage({ src, natural, loadFailed, crop, aspect, onChange, disabled }: CropStageProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<NaturalSize | null>(null);
  const drag = useRef<{ handle: Handle; px: PixelCrop; sx: number; sy: number; scale: number } | null>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const detach = useRef<() => void>(() => {});
  useEffect(() => () => detach.current(), []);

  const start = (e: React.PointerEvent, handle: Handle) => {
    if (disabled || e.button !== 0 || !natural || !crop) return;
    e.preventDefault();
    e.stopPropagation();
    const fit = fitInside(natural, area ?? natural);
    drag.current = {
      handle,
      px: toPixels(crop, natural, MIN_PX),
      sx: e.clientX,
      sy: e.clientY,
      scale: natural.width / Math.max(1, fit.width),
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (ev.buttons === 0) return finish();
      const dx = (ev.clientX - d.sx) * d.scale;
      const dy = (ev.clientY - d.sy) * d.scale;
      onChange(toPercent(clampCrop(resize(d.px, d.handle, dx, dy, aspect), natural, MIN_PX), natural));
    };
    const finish = () => {
      drag.current = null;
      detach.current();
    };
    detach.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      detach.current = () => {};
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
  };

  const fit = natural && area ? fitInside(natural, area) : null;

  return (
    <div className="bg-base-200 relative min-h-0 flex-1">
      <div ref={areaRef} className="absolute inset-3 flex items-center justify-center select-none sm:inset-5">
        {loadFailed ? (
          <div className="text-neutral-content flex flex-col items-center gap-2 text-center text-sm">
            <Icon name="x" className="size-6" />
            <p>{"Couldn't load this image. Close and try again."}</p>
          </div>
        ) : src && fit && crop ? (
          <div className="relative" style={{ width: fit.width, height: fit.height }}>
            <img
              src={src}
              crossOrigin="anonymous"
              alt=""
              draggable={false}
              className="block size-full"
              style={{ width: fit.width, height: fit.height }}
            />
            {/* Dim everything outside the crop with one big shadow on the box. */}
            <div
              role="group"
              aria-label="Crop area"
              onPointerDown={e => start(e, "move")}
              className={`absolute ${disabled ? "" : "cursor-move"}`}
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                outline: "1px solid rgba(255,255,255,0.9)",
              }}
            >
              {/* rule-of-thirds */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
              {!disabled &&
                HANDLES.map(h => (
                  <span
                    key={h.id}
                    data-crop-handle={h.id}
                    onPointerDown={e => start(e, h.id)}
                    className={`border-base-content/40 absolute size-3 rounded-full border bg-white shadow ${h.css}`}
                    style={{ cursor: h.cursor }}
                  />
                ))}
            </div>
          </div>
        ) : (
          <div className="bg-base-content/5 size-full animate-pulse rounded" aria-label="Loading image" role="status" />
        )}
      </div>
    </div>
  );
}
