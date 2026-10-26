// Pure geometry for the canvas handles: pointer zones and the class token a drag lands on.
/**
 * Pure geometry for the canvas handles: which zone the pointer is in, and which class token a
 * drag lands on. No DOM — rects and computed padding come in as numbers — so every threshold and
 * snap is tested on its own. Tokens are written without a prefix; the caller adds the scope
 * (`classes.set` with the current write scopes).
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export type Side = "top" | "right" | "bottom" | "left";

/** px from the right / bottom edge that counts as the edge-resize zone. */
const EDGE_ZONE = 6;
/** Radius around the bottom-left corner reserved for rotate. */
const ROTATE_ZONE = 18;
/** Container padding zone: px inside an edge. */
const PADDING_ZONE = 12;
/** Container resize zone: px outside the right / bottom edge. */
const RESIZE_ZONE = 8;
/** Dwell before the padding / resize zone shows. */
export const PADDING_DWELL_MS = 400;
/** Gap marker shows within this distance of a gap centre. */
const GAP_HIT = 40;
/** Gap markers stay hidden this long after a gap drag. */
export const GAP_COOLDOWN_MS = 250;

/** Tailwind spacing scale (px → token suffix); shared by padding, gap and height snapping. */
export const SPACING_SCALE: ReadonlyArray<readonly [number, string]> = [
  [0, "0"], [1, "px"], [2, "0.5"], [4, "1"], [6, "1.5"], [8, "2"], [10, "2.5"], [12, "3"], [14, "3.5"], [16, "4"],
  [20, "5"], [24, "6"], [28, "7"], [32, "8"], [36, "9"], [40, "10"], [44, "11"], [48, "12"], [56, "14"], [64, "16"],
  [80, "20"], [96, "24"], [112, "28"], [128, "32"], [144, "36"], [160, "40"], [176, "44"], [192, "48"], [208, "52"],
  [224, "56"], [240, "60"], [256, "64"], [288, "72"], [320, "80"], [384, "96"],
];
const SPACING_LABEL = new Map(SPACING_SCALE);

/** Nearest scale value; values past 404px stay unsnapped (today's padding rule). */
export function snapSpacing(px: number): number {
  const v = Math.max(0, px);
  if (v > 404) return v;
  let best = 0;
  for (const [s] of SPACING_SCALE) if (Math.abs(v - s) < Math.abs(v - best)) best = s;
  return best;
}

const arbitrary = (prefix: string, px: number) => `${prefix}-[${Math.round(px)}px]`;
const scaled = (prefix: string, px: number) => {
  const label = SPACING_LABEL.get(px);
  return label != null ? `${prefix}-${label}` : arbitrary(prefix, px);
};

/** `pt-4`, `pl-[420px]` — dragging inward grows padding; the class group is `p{t|r|b|l}`. */
export function paddingToken(side: Side, px: number): { group: string; token: string; px: number } {
  const snapped = Math.round(snapSpacing(px));
  const group = `p${side[0]}`;
  return { group, token: scaled(group, snapped), px: snapped };
}

/** Gap snaps to the 35-step scale (`gap-0` … `gap-96`). */
export function gapToken(px: number): { token: string; px: number } {
  const v = Math.max(0, px);
  let best = SPACING_SCALE[0]!;
  for (const s of SPACING_SCALE) if (Math.abs(v - s[0]) < Math.abs(v - best[0])) best = s;
  return { token: `gap-${best[1]}`, px: best[0] };
}

const WIDTH_FRACTIONS: ReadonlyArray<readonly [string, number]> = [
  ["w-1/4", 0.25], ["w-1/3", 1 / 3], ["w-1/2", 0.5], ["w-2/3", 2 / 3], ["w-3/4", 0.75], ["w-full", 1],
];

/** Width snaps to a fraction of the parent; `free` (Alt held, or no parent width) writes px. */
export function widthToken(px: number, parentWidth: number, free = false): { token: string; px: number } {
  if (free || parentWidth <= 0) return { token: arbitrary("w", px), px: Math.round(px) };
  const ratio = px / parentWidth;
  let best = WIDTH_FRACTIONS[0]!;
  for (const f of WIDTH_FRACTIONS) if (Math.abs(ratio - f[1]) < Math.abs(ratio - best[1])) best = f;
  return { token: best[0], px: Math.round(best[1] * parentWidth) };
}

/** Height snaps to the spacing scale; `free` (Alt) writes px. */
export function heightToken(px: number, free = false): { token: string; px: number } {
  if (free) return { token: arbitrary("h", px), px: Math.round(px) };
  const snapped = snapSpacing(px);
  return SPACING_LABEL.has(snapped) ? { token: scaled("h", snapped), px: snapped } : { token: arbitrary("h", px), px: Math.round(px) };
}

const inside = (r: Rect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** Rotate a point into the element's unrotated frame (around the rect centre). */
function unrotate(r: Rect, x: number, y: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const a = (-deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/**
 * Edge resize / rotate hit test for a selected (non-container) element, rotation-aware. `rect` is
 * the unrotated box (offset size). The bottom-left 18px radius is rotate; within 6px of the right
 * or bottom edge is resize.
 */
export function edgeZone(r: Rect, x: number, y: number, deg = 0): "right" | "bottom" | "rotate" | null {
  const p = unrotate(r, x, y, deg);
  if (Math.hypot(p.x - r.left, p.y - r.bottom) <= ROTATE_ZONE) return "rotate";
  const inY = p.y >= r.top && p.y <= r.bottom;
  const inX = p.x >= r.left && p.x <= r.right;
  if (inY && Math.abs(p.x - r.right) <= EDGE_ZONE) return "right";
  if (inX && Math.abs(p.y - r.bottom) <= EDGE_ZONE) return "bottom";
  return null;
}

/** An edge drag's delta projected onto the element's rotated axis. */
export function projectDelta(dx: number, dy: number, side: "right" | "bottom", deg = 0): number {
  const a = (deg * Math.PI) / 180;
  return side === "right" ? dx * Math.cos(a) + dy * Math.sin(a) : -dx * Math.sin(a) + dy * Math.cos(a);
}

/**
 * Container zones: 0–8px outside the right / bottom edge resizes; within 12px inside an edge
 * edits that side's padding (checked top, bottom, left, right).
 */
export function containerZone(r: Rect, x: number, y: number): { side: Side; mode: "padding" | "resize" } | null {
  if (y > r.bottom && y <= r.bottom + RESIZE_ZONE && x >= r.left && x <= r.right) return { side: "bottom", mode: "resize" };
  if (x > r.right && x <= r.right + RESIZE_ZONE && y >= r.top && y <= r.bottom) return { side: "right", mode: "resize" };
  if (!inside(r, x, y)) return null;
  if (y - r.top < PADDING_ZONE) return { side: "top", mode: "padding" };
  if (r.bottom - y < PADDING_ZONE) return { side: "bottom", mode: "padding" };
  if (x - r.left < PADDING_ZONE) return { side: "left", mode: "padding" };
  if (r.right - x < PADDING_ZONE) return { side: "right", mode: "padding" };
  return null;
}

/** Padding after an inward drag of `delta` px on `side` (positive dx on the left side grows it). */
export function paddingAfterDrag(side: Side, start: number, dx: number, dy: number): number {
  const inward = side === "left" ? dx : side === "right" ? -dx : side === "top" ? dy : -dy;
  return Math.max(0, start + inward);
}

/** Angle of the pointer around the centre, relative to the drag start; Shift snaps to 15°. */
export function rotateAngle(center: { x: number; y: number }, start: { x: number; y: number }, now: { x: number; y: number }, base: number, shift: boolean): number {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(now.y - center.y, now.x - center.x);
  let deg = base + ((a1 - a0) * 180) / Math.PI;
  deg = Math.round(((deg % 360) + 540) % 360 - 180);
  return shift ? Math.round(deg / 15) * 15 : deg;
}

/** `rotate-[15deg]`; 0° removes the class (null). */
export function rotateToken(deg: number): string | null {
  const d = Math.round(deg);
  return d === 0 ? null : `rotate-[${d}deg]`;
}

/** Read `rotate-[Ndeg]` / `rotate-N` / `-rotate-N` from a token. */
export function rotateDegrees(token: string | null): number {
  if (!token) return 0;
  const m = /^(-?)rotate-(?:\[(-?\d+(?:\.\d+)?)deg\]|(\d+))$/.exec(token);
  if (!m) return 0;
  const v = Number(m[2] ?? m[3]);
  return m[1] ? -v : v;
}

export interface Gap {
  /** Centre of the gap between two children, on the cross axis midpoint. */
  x: number;
  y: number;
  /** The gap's size in px. */
  size: number;
}

/**
 * Gaps between consecutive visible children of a flex container. A gap only counts when it
 * matches the container's computed gap within max(20, gap·0.5) (so justify-between doesn't
 * register).
 */
export function gapsBetween(children: readonly Rect[], axis: "row" | "column", computedGap: number): Gap[] {
  const out: Gap[] = [];
  const tolerance = Math.max(20, computedGap * 0.5);
  for (let i = 1; i < children.length; i++) {
    const a = children[i - 1]!;
    const b = children[i]!;
    const size = axis === "row" ? b.left - a.right : b.top - a.bottom;
    if (size < 0 || Math.abs(size - computedGap) > tolerance) continue;
    out.push(
      axis === "row"
        ? { x: a.right + size / 2, y: (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2, size }
        : { x: (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2, y: a.bottom + size / 2, size },
    );
  }
  return out;
}

/** The gap whose centre is within 40px of the pointer, nearest first. */
export function gapAt(gaps: readonly Gap[], x: number, y: number): Gap | null {
  let best: Gap | null = null;
  let d = GAP_HIT;
  for (const g of gaps) {
    const dist = Math.hypot(g.x - x, g.y - y);
    if (dist <= d) {
      d = dist;
      best = g;
    }
  }
  return best;
}
