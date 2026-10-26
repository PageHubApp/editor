// Turns a pointer over the rendered canvas into a validated drop plan (parent, slot, command).
/**
 * From a pointer over the canvas to a drop: the drop parent (the container under the pointer,
 * or its parent near a border), the slot among its rendered children, a beside split, the
 * alignment the drag asks for, and the command + arguments that make the drop — validated with
 * a dry run, so an invalid target paints red and never dispatches.
 *
 * Rendered children are mapped to source handles through `data-edit-src`; a child rendered by
 * a `{% for %}` / `{% if %}` inside the parent lifts to that Liquid block, so a drop next to a
 * repeated row lands next to the loop, never inside it.
 */
import { type NodeHandle, type Store } from "@pagehub/engine";
import { handleForSrc } from "@pagehub/engine/canvas";
import { planBeside, type BesideLabel } from "@pagehub/engine/kits"; import { roleOf, wrapperKind, type AlignIntent } from "@pagehub/engine/kits"; import type { DropTo } from "@pagehub/engine/kits"; import { SRC_ATTR, toRect } from "../canvas/frameDom";
import type { Rect } from "../canvas/geometry";
import type { DragSource } from "./dragSession";
import { alignFromDrag, alignFromZones, detectBeside, findReorder, type Axis, type BesideMemo, type Where } from "./geometry";

export const CONTAINER_TAGS: ReadonlySet<string> = new Set(["div", "section", "main", "header", "footer", "article", "aside", "nav", "form", "ul", "ol", "li", "figure", "fieldset", "details", "dialog", "td", "th"]);
/** Pointer within this distance of a container's border drops beside it, in its parent. */
const BUBBLE_PX = 10;

interface Bar {
  orientation: "horizontal" | "vertical";
  x: number;
  y: number;
  length: number;
}

export interface DropPlan {
  kind: "reorder" | "inside" | "beside";
  command: string;
  args: unknown;
  /** The dry run passed. */
  valid: boolean;
  /** Canvas-document rects. */
  parentRect: Rect | null;
  bar: Bar | null;
  /** The parent is a page / header / footer: a 40px band marks the boundary too. */
  band: boolean;
  ghost: Rect | null;
  beside: { side: "left" | "right"; target: Rect; label: BesideLabel } | null;
  align: AlignIntent | null;
}

interface PlanInput {
  store: Store;
  doc: Document;
  source: DragSource;
  /** Canvas-document coordinates. */
  x: number;
  y: number;
  origin: { x: number; y: number };
  copy: boolean;
  memo: BesideMemo;
  /** The page file (for a drop on an empty page). */
  page: string;
  /** Size of the dragged element (the ghost box). */
  size: { width: number; height: number };
}

const rectOf = (el: Element) => toRect(el.getBoundingClientRect());
const srcEls = (doc: Document) => [...doc.querySelectorAll<HTMLElement>(`[${SRC_ATTR}]`)].filter((el) => !["HTML", "HEAD", "BODY"].includes(el.tagName));
const inside = (r: Rect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** The deepest rendered element under the point, outside the dragged ones. */
function hitElement(doc: Document, x: number, y: number, exclude: readonly Element[]): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of srcEls(doc)) {
    if (exclude.some((d) => d.contains(el))) continue;
    if (inside(rectOf(el), x, y) && (!best || best.contains(el))) best = el;
  }
  return best;
}

const flexOf = (el: Element | null): { flex: boolean; axis: Axis; reversed: boolean } => {
  const cs = el?.ownerDocument.defaultView?.getComputedStyle(el);
  const flex = !!cs && cs.display.includes("flex");
  const dir = cs?.flexDirection ?? "row";
  return { flex, axis: flex && dir.startsWith("row") ? "row" : "column", reversed: flex && dir.endsWith("reverse") };
};

/** Lift a rendered child's handle to the direct child of `parent` (a Liquid block around it). */
function lift(h: NodeHandle | null, parent: NodeHandle | null): NodeHandle | null {
  while (h && h.parent() !== parent) h = h.parent();
  return h;
}

const nearBorder = (r: Rect, x: number, y: number) => x - r.left < BUBBLE_PX || r.right - x < BUBBLE_PX || y - r.top < BUBBLE_PX || r.bottom - y < BUBBLE_PX;

function dropParent(store: Store, el: HTMLElement | null, x: number, y: number): HTMLElement | null {
  if (!el) return null;
  const h = handleForSrc(store, el.getAttribute(SRC_ATTR));
  const container = !!h && CONTAINER_TAGS.has(h.tag);
  const up = () => el.parentElement?.closest<HTMLElement>(`[${SRC_ATTR}]`) ?? null;
  if (!container) return up();
  if (!nearBorder(rectOf(el), x, y)) return el;
  const kind = wrapperKind(store.state, h);
  if (kind === "row" || kind === "item") return el;
  if (flexOf(el).flex && flexOf(el).axis === "row" && flexOf(el.parentElement).flex && flexOf(el.parentElement).axis === "row") return el;
  return up();
}

function draggedHandles(source: DragSource): readonly NodeHandle[] {
  return source.kind === "existing" ? source.handles.filter((h) => h.alive) : [];
}

export function planDrop(p: PlanInput): DropPlan | null {
  const { store, doc, x, y } = p;
  const dragged = draggedHandles(p.source);
  const draggedEls = dragged.flatMap((h) => srcEls(doc).filter((el) => handleForSrc(store, el.getAttribute(SRC_ATTR)) === h));
  const parentEl = dropParent(store, hitElement(doc, x, y, draggedEls), x, y);
  const parent = parentEl ? handleForSrc(store, parentEl.getAttribute(SRC_ATTR)) : null;
  if (parentEl && !parent) return null;
  const pool = parentEl ? [...parentEl.querySelectorAll<HTMLElement>(`[${SRC_ATTR}]`)].filter((el) => el.parentElement?.closest(`[${SRC_ATTR}]`) === parentEl) : srcEls(doc).filter((el) => !el.parentElement?.closest(`[${SRC_ATTR}]`));
  const kids: { h: NodeHandle; rect: Rect }[] = [];
  for (const el of pool) {
    const h = lift(handleForSrc(store, el.getAttribute(SRC_ATTR)), parent);
    if (!h || dragged.includes(h) || draggedEls.some((d) => d === el)) continue;
    const found = kids.find((k) => k.h === h);
    const r = rectOf(el);
    if (found) found.rect = toRect({ left: Math.min(found.rect.left, r.left), top: Math.min(found.rect.top, r.top), width: Math.max(found.rect.right, r.right) - Math.min(found.rect.left, r.left), height: Math.max(found.rect.bottom, r.bottom) - Math.min(found.rect.top, r.top) });
    else kids.push({ h, rect: r });
  }
  const { flex, axis, reversed } = flexOf(parentEl);
  const parentRect = parentEl ? rectOf(parentEl) : null;
  const content = parentEl ? contentRect(parentEl) : null;
  const plan = (kind: DropPlan["kind"], to: DropTo, bar: Bar | null, align: AlignIntent | null): DropPlan => {
    const command = p.source.kind === "existing" ? "element.move" : "element.insert";
    const args = p.source.kind === "existing" ? { nodes: dragged, to, copy: p.copy, align } : { ...p.source.insert, to };
    return { kind, command, args, valid: store.can(command, args), parentRect, bar, band: ["page", "header", "footer"].includes(roleOf(parent) ?? ""), ghost: ghostAt(p.size, bar, content, align), beside: null, align };
  };
  const r = findReorder(kids.map((k) => k.rect), axis, reversed, x, y);
  if (!r) return plan("inside", parent ? { append: parent } : { file: p.page, where: "end" }, null, null);
  const kid = kids[r.index]!;
  const besideOk = p.source.kind === "existing" || p.source.insert.snippet !== undefined;
  if (r.reason === "nearest" && parent && besideOk) {
    const side = detectBeside(kid.rect, x, y, { column: axis === "column", skip: !!roleOf(parent), inFlow: kids.length }, p.memo);
    const besidePlan = side && planBeside(store.state, kid.h);
    if (side && besidePlan) {
      const args = p.source.kind === "existing" ? { nodes: dragged, target: kid.h, side, copy: p.copy } : { snippet: p.source.insert.snippet, target: kid.h, side };
      const w = Math.min(p.size.width, kid.rect.width / 2);
      const ghost = toRect({ left: side === "left" ? kid.rect.left - w - 8 : kid.rect.right + 8, top: kid.rect.top, width: w, height: Math.min(p.size.height, kid.rect.height) });
      return { kind: "beside", command: "layout.dropBeside", args, valid: store.can("layout.dropBeside", args), parentRect, bar: null, band: false, ghost, beside: { side, target: kid.rect, label: besidePlan.label }, align: null };
    }
  }
  const where: Where = r.where;
  const sameParent = dragged.length > 0 && dragged.every((h) => h.parent() === parent);
  const align = sameParent && parentRect ? (alignFromDrag(parentRect, axis, p.origin, x, y) ?? (flex ? alignFromZones(parentRect, axis, true, x, y) : null)) : null;
  return plan("reorder", where === "before" ? { before: kid.h } : { after: kid.h }, barFor(kids.map((k) => k.rect), r.index, where, axis, content), align);
}

/** The parent's content box (inside its padding): where the bar and ghost sit. */
export function contentRect(el: HTMLElement): Rect {
  const r = rectOf(el);
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  const px = (v: string | undefined) => parseFloat(v ?? "") || 0;
  const l = px(cs?.paddingLeft), t = px(cs?.paddingTop);
  return toRect({ left: r.left + l, top: r.top + t, width: Math.max(0, r.width - l - px(cs?.paddingRight)), height: Math.max(0, r.height - t - px(cs?.paddingBottom)) });
}

/** The ghost: the dragged size, 4px past the insertion bar, shifted to the alignment zone. */
export function ghostAt(size: { width: number; height: number }, bar: Bar | null, content: Rect | null, align: AlignIntent | null): Rect | null {
  const box = content ?? (bar ? toRect({ left: bar.x, top: bar.y, width: bar.length, height: size.height }) : null);
  if (!box) return null;
  const width = Math.min(size.width, box.width || size.width);
  const top = bar ? (bar.orientation === "horizontal" ? bar.y + 4 : bar.y) : box.top + 4;
  let left = bar?.orientation === "vertical" ? bar.x + 4 : box.left;
  if (align?.axis === "horizontal") left = align.zone === "start" ? box.left : align.zone === "end" ? box.right - width : box.left + (box.width - width) / 2;
  return toRect({ left, top, width, height: size.height });
}

/** The insertion bar: across the parent's box at the boundary (a gap's middle), or a vertical line in a row. */
export function barFor(rects: readonly Rect[], index: number, where: Where, axis: Axis, parent: Rect | null): Bar {
  const r = rects[index]!;
  const sorted = [...rects].sort((a, b) => (axis === "row" ? a.left - b.left : a.top - b.top));
  const i = sorted.indexOf(r);
  const next = where === "after" ? sorted[i + 1] : sorted[i - 1];
  if (axis === "row") {
    const edge = where === "before" ? r.left : r.right;
    const x = next ? (edge + (where === "before" ? next.right : next.left)) / 2 : edge;
    return { orientation: "vertical", x, y: r.top, length: r.height };
  }
  const edge = where === "before" ? r.top : r.bottom;
  const y = next ? (edge + (where === "before" ? next.bottom : next.top)) / 2 : edge;
  const box = parent ?? r;
  return { orientation: "horizontal", x: box.left, y, length: box.width };
}
