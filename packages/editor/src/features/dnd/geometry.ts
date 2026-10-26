// Pure drop geometry: reorder slot, beside detection, alignment intent and layer-row zones.
/**
 * Pure drop geometry: where among a parent's children the pointer drops, whether it is a
 * "beside" drop, which alignment the drag asks for, and the layers panel's row zones. Rects
 * and points come in as numbers (canvas-document coordinates), so every threshold is tested
 * on its own.
 */
import type { AlignIntent, AlignZone } from "@pagehub/engine/kits";
import type { Rect } from "../canvas/geometry";
import { clamp } from "../../primitives/math";

export type Axis = "row" | "column";
export type Where = "before" | "after";

/** First part of the nearest child (along the main axis) that counts as "before". */
const BEFORE_FRACTION = 0.3;
/** With a single in-flow child the split widens so before / after are equally easy to hit. */
const BEFORE_FRACTION_SINGLE = 0.42;

interface Reorder {
  /** Index into the `children` given. */
  index: number;
  where: Where;
  reason: "gap" | "before_all" | "after_all" | "nearest";
}

const start = (r: Rect, axis: Axis) => (axis === "row" ? r.left : r.top);
const end = (r: Rect, axis: Axis) => (axis === "row" ? r.right : r.bottom);
const size = (r: Rect, axis: Axis) => (axis === "row" ? r.width : r.height);

/**
 * The drop slot among `children` (null entries are skipped: the dragged node, or not rendered).
 * Zero-size children are skipped; the rest are sorted along the main axis. In a gap → after
 * the previous child; before the first / after the last → the edges; else the nearest centre,
 * split at 30% (42% with one child). Reversed flex flips before / after.
 */
export function findReorder(children: ReadonlyArray<Rect | null>, axis: Axis, reversed: boolean, x: number, y: number): Reorder | null {
  const flow = children
    .map((r, index) => ({ r, index }))
    .filter((c): c is { r: Rect; index: number } => !!c.r && c.r.width > 0 && c.r.height > 0)
    .sort((a, b) => start(a.r, axis) - start(b.r, axis));
  if (!flow.length) return null;
  const pos = axis === "row" ? x : y;
  const flip = (w: Where): Where => (reversed ? (w === "before" ? "after" : "before") : w);
  for (let i = 0; i < flow.length - 1; i++) {
    const gs = end(flow[i]!.r, axis);
    const ge = start(flow[i + 1]!.r, axis);
    if (gs < ge && pos >= gs && pos <= ge) return { index: flow[i]!.index, where: flip("after"), reason: "gap" };
  }
  if (pos < start(flow[0]!.r, axis)) return { index: flow[0]!.index, where: flip("before"), reason: "before_all" };
  const last = flow.at(-1)!;
  if (pos > end(last.r, axis)) return { index: last.index, where: flip("after"), reason: "after_all" };
  let near = flow[0]!;
  for (const c of flow) if (Math.abs(pos - (start(c.r, axis) + size(c.r, axis) / 2)) < Math.abs(pos - (start(near.r, axis) + size(near.r, axis) / 2))) near = c;
  const fraction = flow.length === 1 ? BEFORE_FRACTION_SINGLE : BEFORE_FRACTION;
  return { index: near.index, where: flip(pos - start(near.r, axis) < size(near.r, axis) * fraction ? "before" : "after"), reason: "nearest" };
}

const BESIDE_ZONE = 0.22;
const BESIDE_MIN_EDGE_PX = 28;
const BESIDE_MAX_EDGE_PX = 96;
const BESIDE_VERTICAL_GUTTER_RATIO = 0.18;
const BESIDE_MIN_WIDTH = 160;
const BESIDE_HYSTERESIS_PX = 5;


/** The last beside hit, for the 5px hysteresis on the same target. */
export interface BesideMemo {
  key: string;
  side: "left" | "right" | null;
}

/**
 * Beside detection on the nearest child of a column parent (not page / header / footer /
 * section) with ≥2 in-flow children, target ≥160px wide, pointer inside its vertical body
 * (gutter clamp(h·0.18, 18, 56)) and within the edge band clamp(w·0.22, 28, 96) (+5px when the
 * same side was hit last time).
 */
export function detectBeside(target: Rect, x: number, y: number, opts: { column: boolean; skip: boolean; inFlow: number }, memo: BesideMemo): "left" | "right" | null {
  const key = `${target.left},${target.top},${target.width},${target.height}`;
  const hit = (side: "left" | "right" | null) => {
    memo.key = side ? key : "";
    memo.side = side;
    return side;
  };
  if (!opts.column || opts.skip || opts.inFlow < 2 || target.width < BESIDE_MIN_WIDTH) return hit(null);
  const relX = x - target.left;
  const relY = y - target.top;
  const gutter = clamp(target.height * BESIDE_VERTICAL_GUTTER_RATIO, 18, 56);
  if (relY < gutter || relY > target.height - gutter) return hit(null);
  const same = memo.key === key;
  const band = clamp(target.width * BESIDE_ZONE, BESIDE_MIN_EDGE_PX, BESIDE_MAX_EDGE_PX);
  if (relX >= 0 && relX <= band + (same && memo.side === "left" ? BESIDE_HYSTERESIS_PX : 0)) return hit("left");
  if (relX >= 0 && relX <= target.width && relX >= target.width - band - (same && memo.side === "right" ? BESIDE_HYSTERESIS_PX : 0)) return hit("right");
  return hit(null);
}

const ALIGN_DEADZONE_PX = 20;
const ALIGN_DOMINANT_RATIO = 1.5;
const MIN_ALIGN_CONTAINER_PX = 200;
const INNER_EDGE_PX = 32;

const third = (rel: number) => rel > 1 / 3 && rel < 2 / 3;

/**
 * Cross-axis alignment from the drag direction: a drag ≥20px with the cross axis dominant ×1.5
 * (horizontal in a column, vertical in a row). The middle third of the parent is centre, else
 * start / end by the drag's sign. The parent must be ≥200px in at least one dimension.
 */
export function alignFromDrag(parent: Rect, axis: Axis, origin: { x: number; y: number }, x: number, y: number): AlignIntent | null {
  if (parent.width < MIN_ALIGN_CONTAINER_PX && parent.height < MIN_ALIGN_CONTAINER_PX) return null;
  const dx = x - origin.x;
  const dy = y - origin.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < ALIGN_DEADZONE_PX) return null;
  if (axis === "column" && Math.abs(dx) > Math.abs(dy) * ALIGN_DOMINANT_RATIO) {
    return { axis: "horizontal", zone: third((x - parent.left) / parent.width) ? "center" : dx < 0 ? "start" : "end" };
  }
  if (axis === "row" && Math.abs(dy) > Math.abs(dx) * ALIGN_DOMINANT_RATIO) {
    return { axis: "vertical", zone: third((y - parent.top) / parent.height) ? "center" : dy < 0 ? "start" : "end" };
  }
  return null;
}

/**
 * Fallback: alignment from the pointer's zone in a flex parent. Same parent as the drag
 * origin: 32px inner edges + the middle third; another parent: <30% start, >70% end, else centre.
 */
export function alignFromZones(parent: Rect, axis: Axis, sameParent: boolean, x: number, y: number): AlignIntent | null {
  const horizontal = axis === "column";
  const len = horizontal ? parent.width : parent.height;
  if (len < MIN_ALIGN_CONTAINER_PX) return null;
  const rel = horizontal ? x - parent.left : y - parent.top;
  const alignAxis = horizontal ? "horizontal" : "vertical";
  let zone: AlignZone | null;
  if (sameParent) zone = rel < INNER_EDGE_PX ? "start" : rel > len - INNER_EDGE_PX ? "end" : third(rel / len) ? "center" : null;
  else zone = rel / len < 0.3 ? "start" : rel / len > 0.7 ? "end" : "center";
  return zone ? { axis: alignAxis, zone } : null;
}

export type LayerZone = "before" | "after" | "inside" | "after-parent";

/**
 * Layers panel row zones: within depth·16+8+40px of the left edge (depth > 0) → after the
 * parent (reparent outward); a container with children: top 20% before, bottom 20% after,
 * middle inside; an empty container 25% / 75%; anything else halves.
 */
export function layerZone(row: Rect, x: number, y: number, opts: { depth: number; container: boolean; hasChildren: boolean }): LayerZone {
  if (opts.depth > 0 && x - row.left < opts.depth * 16 + 8 + 40) return "after-parent";
  const rel = (y - row.top) / (row.height || 1);
  if (!opts.container) return rel < 0.5 ? "before" : "after";
  const edge = opts.hasChildren ? 0.2 : 0.25;
  return rel < edge ? "before" : rel > 1 - edge ? "after" : "inside";
}
