// The distances and thresholds for the Alt-hover measurement overlay; the DOM side is MeasurementLines.tsx.
/**
 * Figma-style distances for the hovered element while Alt is held: to each edge of its parent
 * (when there is room) and to a sibling beside or above / below it that overlaps its extent.
 * Pure rect arithmetic, so every threshold is tested without layout.
 */
import type { Rect } from "./geometry";

/** Farther than this and no line is drawn. */
export const MEASURE_MAX = 300;

export interface MeasureLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distance: number;
  direction: "horizontal" | "vertical";
  labelX: number;
  labelY: number;
}

const mid = (a: number, b: number) => (a + b) / 2;

export function measureLines(t: Rect, parent: Rect | null, siblings: readonly Rect[], max = MEASURE_MAX): MeasureLine[] {
  const out: MeasureLine[] = [];
  /** A horizontal line at `y` from `x1` to `x2`, when it is longer than `min` and shorter than `max`. */
  const h = (y: number, x1: number, x2: number, min: number) => {
    const d = x2 - x1;
    if (d > min && d < max) out.push({ x1, y1: y, x2, y2: y, distance: Math.round(d), direction: "horizontal", labelX: mid(x1, x2), labelY: y });
  };
  const v = (x: number, y1: number, y2: number, min: number) => {
    const d = y2 - y1;
    if (d > min && d < max) out.push({ x1: x, y1, x2: x, y2, distance: Math.round(d), direction: "vertical", labelX: x, labelY: mid(y1, y2) });
  };
  if (parent) {
    const cx = mid(t.left, t.right);
    const cy = mid(t.top, t.bottom);
    v(cx, parent.top, t.top, 1);
    v(cx, t.bottom, parent.bottom, 1);
    h(cy, parent.left, t.left, 1);
    h(cy, t.right, parent.right, 1);
  }
  for (const s of siblings) {
    if (Math.abs(t.top - s.top) < t.height && Math.abs(t.bottom - s.bottom) < t.height) {
      const y = mid(Math.max(t.top, s.top), Math.min(t.bottom, s.bottom));
      if (s.left > t.right) h(y, t.right, s.left, 0);
      else if (s.right < t.left) h(y, s.right, t.left, 0);
    }
    if (Math.abs(t.left - s.left) < t.width && Math.abs(t.right - s.right) < t.width) {
      const x = mid(Math.max(t.left, s.left), Math.min(t.right, s.right));
      if (s.top > t.bottom) v(x, t.bottom, s.top, 0);
      else if (s.bottom < t.top) v(x, s.bottom, t.top, 0);
    }
  }
  return out;
}
