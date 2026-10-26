/**
 * Keeps a piece of canvas chrome (name tag, badges, hover chip, tool buttons, readouts, lint card) inside the
 * visible canvas. Each one is positioned from its element's rect with `left` / `top` / `transform`; this
 * hook then measures the result against the overlay layer it sits in (the nearest `[data-slot]` ancestor) and nudges it back with the CSS
 * `translate` property, which composes with `transform` and leaves the component's own style alone.
 *
 *   const ref = useKeepInView<HTMLSpanElement>();
 *   <span ref={ref} style={at(rect, "top-start")}>…</span>
 *
 * The inline text toolbar and popovers opened from chips (`AnchoredPopover`) do their own collision handling.
 */
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useCanvasFrame } from "./canvasContext";
import { visibleInFrame } from "./frameDom";
import type { Rect } from "./geometry";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Gap kept between a nudged chip and the canvas edge. */
export const KEEP_IN_VIEW_PAD = 4;

/**
 * The shift (same units as the boxes) that brings `box` inside `bounds`: left edge wins when the box is wider
 * than the bounds, top edge wins when it is taller.
 */
export function nudgeIntoBounds(box: Box, bounds: Box, pad = KEEP_IN_VIEW_PAD): { dx: number; dy: number } {
  const shift = (lo: number, hi: number, bLo: number, bHi: number) => {
    if (hi - lo > bHi - bLo - 2 * pad) return bLo + pad - lo;
    if (lo < bLo + pad) return bLo + pad - lo;
    if (hi > bHi - pad) return bHi - pad - hi;
    return 0;
  };
  return { dx: shift(box.left, box.right, bounds.left, bounds.right), dy: shift(box.top, box.bottom, bounds.top, bounds.bottom) };
}

/**
 * Re-checks after every render of the owner; set `translate` on the ref'd element so it stays inside the canvas frame's
 * visible area (the overlay layer when there is no frame). `anchor` is the element's rect in the overlay layer's
 * coordinates: when it lies wholly outside the frame (scrolled out of view) the chip is hidden, never pulled in.
 */
export function useKeepInView<T extends HTMLElement>(anchor?: Rect | null): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const { frame } = useCanvasFrame();
  useLayoutEffect(() => {
    const el = ref.current;
    const layer = el?.closest("[data-slot]") ?? el?.offsetParent;
    if (!el || !layer) return;
    el.style.translate = "";
    el.style.visibility = "";
    const f = frame?.getBoundingClientRect();
    const bounds = f && f.width > 0 && f.height > 0 ? f : layer.getBoundingClientRect();
    if (anchor && frame && !visibleInFrame(anchor, frame, layer)) {
      el.style.visibility = "hidden";
      return;
    }
    const { dx, dy } = nudgeIntoBounds(el.getBoundingClientRect(), bounds);
    if (!dx && !dy) return;
    // CSS `zoom` on the chip scales its own `translate` too (the chips cancel the device zoom with it).
    const zoom = parseFloat(getComputedStyle(el).zoom) || 1;
    el.style.translate = `${dx / zoom}px ${dy / zoom}px`;
  });
  return ref;
}
