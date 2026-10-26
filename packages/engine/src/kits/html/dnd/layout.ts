/**
 * The structure drag and drop reasons about: element roles (page / section / header / footer
 * from the tag), class-token tests, and the wrapper classes a drop writes. Wrappers are
 * recognised by their class signature, so a Row / Item / Align made by an earlier drop is
 * found again from the source alone. Hosts swap the classes with `layoutClassesFacet`.
 */
import { defineFacet } from "../../../extensions/extension";
import type { EditorState } from "../../../state/state";
import type { NodeHandle } from "../../../state/handles";
import { childrenOf } from "../nodes";

export type SectionRole = "page" | "section" | "header" | "footer";
export type AlignZone = "start" | "center" | "end";
export type AlignAxis = "horizontal" | "vertical";
export interface AlignIntent {
  zone: AlignZone;
  axis: AlignAxis;
}
export type BesideSide = "left" | "right";

export interface LayoutClasses {
  row: string;
  promotedRow: string;
  item: string;
  promotedTargetItem: string;
  promotedDraggedItem: string;
  sideAlign: Record<BesideSide, string>;
  alignHorizontal: Record<AlignZone, string>;
  alignVertical: Record<AlignZone, string>;
  section: string;
  content: string;
  card: string;
  segment: string;
  plain: string;
}

export const DEFAULT_LAYOUT_CLASSES: LayoutClasses = {
  row: "flex flex-row flex-wrap gap-space-md items-stretch min-w-0 w-full",
  promotedRow: "flex flex-row flex-nowrap gap-space-md items-stretch min-w-0 w-full",
  item: "flex min-w-0 flex-1 basis-0 h-full flex-col gap-4",
  promotedTargetItem: "flex min-w-0 flex-1 basis-0 h-full flex-col gap-4",
  promotedDraggedItem: "flex min-w-0 shrink-0 h-full flex-col gap-4",
  sideAlign: { left: "items-start text-left", right: "items-end text-right" },
  alignHorizontal: { start: "flex w-full justify-start", center: "flex w-full justify-center", end: "flex w-full justify-end" },
  alignVertical: {
    start: "flex flex-col self-stretch items-start justify-start",
    center: "flex flex-col self-stretch items-center justify-center",
    end: "flex flex-col self-stretch items-end justify-end",
  },
  section: "bg-base-100 text-base-content w-full flex flex-col items-center gap-space-md py-space-lg px-container-x",
  content: "flex flex-row flex-wrap gap-space-md w-full max-w-page mx-auto",
  card: "flex flex-col gap-space-md flex-1 min-w-0 bg-base-200 text-base-content rounded-xl p-space-md shadow-sm",
  segment: "flex flex-col gap-space-xs w-full",
  plain: "flex flex-col gap-space-md w-full",
};

/** Classes the drop commands write; later contributions override earlier keys. */
export const layoutClassesFacet = defineFacet<Partial<LayoutClasses>, LayoutClasses>({
  id: "layoutClasses",
  combine: (values) => Object.assign({}, DEFAULT_LAYOUT_CLASSES, ...values),
});

export const layoutClasses = (state: EditorState): LayoutClasses => state.facet(layoutClassesFacet);

const ROLE_TAGS: Readonly<Record<string, SectionRole>> = { main: "page", section: "section", header: "header", footer: "footer" };

export function roleOf(h: NodeHandle | null | undefined): SectionRole | null {
  return h && h.kind === "element" ? (ROLE_TAGS[h.tag] ?? null) : null;
}

/** Raw-text elements, and SVG (edited as a whole): nothing can be dropped into them. */
export const RAW_ELEMENTS: ReadonlySet<string> = new Set(["script", "style", "textarea", "title", "template", "svg"]);

export const tokensOf = (h: NodeHandle | null | undefined): string[] => (h && h.kind === "element" ? h.classes() : []);
export const hasToken = (h: NodeHandle | null | undefined, token: string): boolean => tokensOf(h).includes(token);
const hasAll = (h: NodeHandle, cls: string) => {
  const own = new Set(tokensOf(h));
  return cls.split(/\s+/).every((t) => own.has(t));
};

/** `flex-row`, unprefixed or at a breakpoint (button strips often use `sm:flex-row`). */
export const isFlexRow = (h: NodeHandle): boolean => tokensOf(h).some((t) => /^(?:(?:sm|md|lg|xl|2xl):)?flex-row$/.test(t));
export const isStack = (h: NodeHandle): boolean => hasToken(h, "flex") && (hasToken(h, "flex-col") || hasToken(h, "flex-col-reverse"));

export type WrapperKind = "row" | "item" | "align";

/** Which drop wrapper a node is (by class signature), or null. */
export function wrapperKind(state: EditorState, h: NodeHandle | null | undefined): WrapperKind | null {
  if (!h || h.kind !== "element" || h.tag !== "div") return null;
  const c = layoutClasses(state);
  if (hasAll(h, c.row) || hasAll(h, c.promotedRow)) return "row";
  if (hasAll(h, c.item) || hasAll(h, c.promotedDraggedItem)) return "item";
  if ([...Object.values(c.alignHorizontal), ...Object.values(c.alignVertical)].some((cls) => hasAll(h, cls) && tokensOf(h).length === cls.split(/\s+/).length)) return "align";
  return null;
}

export const isCard = (state: EditorState, h: NodeHandle | null) => !!h && h.kind === "element" && hasAll(h, layoutClasses(state).card);
export const isSegment = (state: EditorState, h: NodeHandle | null) => !!h && h.kind === "element" && hasAll(h, layoutClasses(state).segment) && tokensOf(h).length === layoutClasses(state).segment.split(/\s+/).length;

const CENTER_TOKENS = ["items-center", "justify-center", "text-center", "mx-auto", "place-items-center", "content-center"];
/** Two or more centring tokens: the content is centred and a split keeps it so. */
export const isCentred = (h: NodeHandle | null | undefined): boolean => CENTER_TOKENS.filter((t) => hasToken(h, t)).length >= 2;

/** A flex-row container with 2–3 children: a beside drop inserts into it. */
export const isSimpleRow = (h: NodeHandle | null | undefined): boolean => {
  if (!h || h.kind !== "element" || !hasToken(h, "flex") || !isFlexRow(h)) return false;
  const n = childrenOf(h).length;
  return n >= 2 && n <= 3;
};

export const isAncestorOrSelf = (a: NodeHandle, b: NodeHandle): boolean => {
  for (let p: NodeHandle | null = b; p; p = p.parent()) if (p === a) return true;
  return false;
};
