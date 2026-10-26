/**
 * The layout of one element as far as whitespace is concerned: the boxes it may generate (`outer`), how it lays out
 * its children (`inner`), and whether its white-space may be preserved. Read from the tag's default, its `class`
 * (Tailwind utilities are modelled here, everything else comes from `LayoutHints`), its `style` and a few attributes
 * (`hidden`, `popover`). Every value is a SET of what the element may be at some breakpoint or state.
 */
import type { LayoutHint, LayoutHints } from "./cssHints";

/** How the element sits in its parent: a block-level box, an inline-level box, a table part, nothing (`none`), or its children (`contents`). */
export type Outer = "block" | "inline" | "table-part" | "none" | "contents" | "unknown";
/**
 * How it lays out its children: `flow` (a block container), `items` (flex, grid, table rows: whitespace-only text between
 * children is dropped), `inline` (an inline box: its children are inline content), `pre` (white-space is kept), `none`
 * (no children to format: raw text, a replaced element, an unknown layout).
 */
export type Inner = "flow" | "items" | "inline" | "pre" | "none";

export interface Layout {
  outer: Set<Outer>;
  inner: Inner;
  outOfFlow: boolean;
  floats: boolean;
  /** Generated `::before` / `::after` content may sit at its inner edges. */
  pseudo: boolean;
  /** Whitespace inside it may be kept (its own `white-space`, a rule on its descendants, or a class Liquid writes). */
  pre: boolean;
}

const DISPLAY: Record<string, [Outer, Inner]> = {
  block: ["block", "flow"],
  "flow-root": ["block", "flow"],
  "list-item": ["block", "flow"],
  flex: ["block", "items"],
  grid: ["block", "items"],
  table: ["block", "items"],
  inline: ["inline", "inline"],
  "inline-block": ["inline", "flow"],
  "inline-flex": ["inline", "items"],
  "inline-grid": ["inline", "items"],
  "inline-table": ["inline", "items"],
  "table-row-group": ["table-part", "items"],
  "table-header-group": ["table-part", "items"],
  "table-footer-group": ["table-part", "items"],
  "table-row": ["table-part", "items"],
  "table-column-group": ["table-part", "items"],
  "table-column": ["table-part", "none"],
  "table-cell": ["table-part", "flow"],
  "table-caption": ["table-part", "flow"],
  contents: ["contents", "inline"],
  none: ["none", "none"],
};

const displayOf = (value: string): [Outer, Inner] => DISPLAY[value.trim().split(/\s+/).join(" ")] ?? (value === "block flow" ? DISPLAY.block! : ["unknown", "none"]);

const BLOCK_TAGS = new Set(
  "address article aside blockquote center dd details dialog dir div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr legend li main menu nav ol p search section summary ul".split(" "),
);
const PRE_TAGS = new Set(["pre", "listing", "xmp", "plaintext", "textarea"]);
const INVISIBLE_TAGS = new Set(["script", "style", "link", "meta", "template", "title", "base", "head", "area", "param", "source", "track", "datalist"]);
/** Containers whose whitespace text never renders: options, media fallbacks. */
const IGNORED_TEXT_TAGS = new Set(["select", "optgroup", "video", "audio", "colgroup"]);
const INLINE_BLOCK_TAGS = new Set(["button", "input", "img", "video", "audio", "iframe", "canvas", "svg", "math", "object", "embed", "meter", "progress", "select", "textarea", "br", "wbr", "picture"]);

function tagDefault(tag: string, attrs: ReadonlyMap<string, string | null>): [Outer, Inner] {
  if (PRE_TAGS.has(tag)) return [tag === "textarea" ? "inline" : "block", "pre"];
  if (INVISIBLE_TAGS.has(tag)) return ["none", "none"];
  if (tag === "input" && (attrs.get("type") ?? "").toLowerCase() === "hidden") return ["none", "none"];
  if (tag === "table") return ["block", "items"];
  if (tag === "thead" || tag === "tbody" || tag === "tfoot" || tag === "tr" || tag === "colgroup") return ["table-part", "items"];
  if (tag === "td" || tag === "th" || tag === "caption") return ["table-part", "flow"];
  if (tag === "col") return ["table-part", "none"];
  if (tag === "option") return ["table-part", "none"];
  if (BLOCK_TAGS.has(tag)) return ["block", "flow"];
  if (tag === "button") return ["inline", "flow"];
  if (INLINE_BLOCK_TAGS.has(tag)) return ["inline", "none"];
  if (tag === "noscript" || tag.includes("-")) return ["unknown", "none"];
  return ["inline", "inline"];
}

/** Utility classes whose base names a layout-affecting value: anything else is not modelled here. */
const POSITION_OUT = new Set(["absolute", "fixed", "sr-only"]);
const FLOATS = new Set(["float-left", "float-right", "float-start", "float-end"]);
const PRE_UTILITIES = new Set(["whitespace-pre", "whitespace-pre-line", "whitespace-pre-wrap", "whitespace-break-spaces"]);

interface ClassEffect {
  display?: string;
  outOfFlow?: boolean;
  floats?: boolean;
  pre?: boolean;
}

/** The effect of a utility's base (`flex`, `[display:grid]`, `line-clamp-2`), or null when it has none on layout. */
function utilityEffect(base: string): ClassEffect | null {
  if (base === "hidden") return { display: "none" };
  if (base in DISPLAY) return { display: base };
  if (POSITION_OUT.has(base)) return { outOfFlow: true };
  if (FLOATS.has(base)) return { floats: true };
  if (PRE_UTILITIES.has(base)) return { pre: true };
  if (/^line-clamp-(?!none)/.test(base)) return { display: "unknown" };
  const arbitrary = /^\[([a-z-]+):(.+)\]$/.exec(base);
  if (arbitrary) {
    const [, prop, value] = arbitrary;
    const v = value!.replace(/_/g, " ");
    if (prop === "display") return { display: v in DISPLAY ? v : "unknown" };
    if (prop === "position") return /absolute|fixed|var\(/.test(v) ? { outOfFlow: true } : null;
    if (prop === "float") return v === "none" ? null : { floats: true };
    if (prop === "white-space" || prop === "white-space-collapse") return { pre: true };
  }
  return null;
}

/** Split a class into its variants and base at top-level `:` (not inside `[…]` or `(…)`). */
export function splitVariants(cls: string): { variants: string[]; base: string } {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i]!;
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) {
      parts.push(cls.slice(start, i));
      start = i + 1;
    }
  }
  const base = cls.slice(start).replace(/^!|!$/g, "");
  return { variants: parts, base };
}

/** A variant that styles another element than the one carrying the class (`*:`, `[&>svg]:`). */
function targetsOthers(variant: string): boolean {
  if (variant === "*" || variant === "**") return true;
  if (!variant.startsWith("[")) return false;
  if (variant.startsWith("[@")) return false;
  return !variant.includes("&") || /&[_\s>~+]/.test(variant);
}

const PSEUDO_VARIANTS = new Set(["before", "after", "marker"]);
const OTHER_PART_VARIANTS = new Set(["placeholder", "file", "selection", "first-letter", "first-line", "backdrop", "details-content"]);

export interface ElementFacts {
  tag: string;
  /** Static attribute values; null = valueless. A value holding Liquid is not here: `dynamic` lists its name. */
  attrs: ReadonlyMap<string, string | null>;
  /** Attributes whose value holds Liquid. */
  dynamic: ReadonlySet<string>;
}

function mergeHint(h: LayoutHint | undefined, into: { display: Set<string>; outOfFlow: boolean; floats: boolean; pre: boolean; pseudo: boolean; descendants: boolean }): void {
  if (!h) return;
  for (const d of h.display) into.display.add(d);
  into.outOfFlow ||= h.outOfFlow;
  into.floats ||= h.floats;
  into.pre ||= h.pre;
  into.pseudo ||= h.pseudo;
  into.descendants ||= h.descendants;
}

/** What `el` may be, given the site's `hints`. */
export function layoutOf(el: ElementFacts, hints: LayoutHints): Layout {
  const unknown: Layout = { outer: new Set(["unknown"]), inner: "none", outOfFlow: true, floats: true, pseudo: true, pre: true };
  // A class or style written by Liquid, or a name the parser couldn't read, can be anything.
  if (el.dynamic.has("class") || el.dynamic.has("style") || !el.tag) return unknown;
  const [defOuter, defInner] = tagDefault(el.tag, el.attrs);
  const unconditional: string[] = [];
  const acc = { display: new Set<string>(), outOfFlow: false, floats: false, pre: false, pseudo: false, descendants: false };

  for (const cls of (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean)) {
    mergeHint(hints.classes.get(cls), acc);
    const { variants, base } = splitVariants(cls);
    const effect = utilityEffect(base);
    const lastVariant = variants.at(-1);
    if (lastVariant && PSEUDO_VARIANTS.has(lastVariant)) {
      acc.pseudo = true;
      continue;
    }
    if (lastVariant && OTHER_PART_VARIANTS.has(lastVariant)) continue;
    if (!effect) continue;
    if (variants.some(targetsOthers)) {
      acc.descendants = true;
      continue;
    }
    if (effect.display) (variants.length ? acc.display.add(effect.display) : unconditional.push(effect.display));
    acc.outOfFlow ||= !!effect.outOfFlow;
    acc.floats ||= !!effect.floats;
    acc.pre ||= !!effect.pre;
  }
  mergeHint(hints.tags.get(el.tag), acc);
  const id = el.attrs.get("id");
  if (id) mergeHint(hints.ids.get(id), acc);
  for (const name of [...el.attrs.keys(), ...el.dynamic]) mergeHint(hints.attrs.get(name), acc);
  if (el.dynamic.has("id") && hints.ids.size) return unknown;

  // An inline style wins over the class's display (an `!important` utility may still win: both stay possible).
  const style = el.attrs.get("style") ?? "";
  for (const decl of style.split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).replace(/!important/i, "").trim().toLowerCase();
    if (prop === "display") unconditional.push(value in DISPLAY ? value : "unknown");
    else if (prop === "position" && !/^(static|relative|sticky)$/.test(value)) acc.outOfFlow = true;
    else if (prop === "float" && value !== "none") acc.floats = true;
    else if ((prop === "white-space" || prop === "white-space-collapse") && !/^(normal|nowrap|collapse)$/.test(value)) acc.pre = true;
    else if (prop === "all") return unknown;
  }

  if (el.attrs.has("hidden")) {
    if ((el.attrs.get("hidden") ?? "").toLowerCase() === "until-found") return unknown;
    acc.display.add("none");
  }
  if (el.attrs.has("popover") || el.tag === "dialog") {
    acc.display.add("none");
    acc.outOfFlow = true;
  }

  const outer = new Set<Outer>();
  const inners = new Set<Inner>();
  const add = ([o, i]: [Outer, Inner]) => {
    outer.add(o);
    if (o !== "none") inners.add(i);
  };
  if (unconditional.length) for (const d of unconditional) add(d === "unknown" ? ["unknown", "none"] : displayOf(d));
  else add([defOuter, defInner]);
  for (const d of acc.display) add(d === "unknown" ? ["unknown", "none"] : displayOf(d));
  // The tag's own content model wins where the display doesn't decide it: raw text, replaced elements, ignored text.
  let inner: Inner;
  if (acc.pre || defInner === "pre") inner = "pre";
  else if (acc.descendants || outer.has("unknown")) inner = "none";
  else if (IGNORED_TEXT_TAGS.has(el.tag)) inner = "items";
  else if (defInner === "none") inner = "none";
  else if (inners.has("inline")) inner = "inline";
  else if (inners.has("flow")) inner = "flow";
  else if (inners.has("items")) inner = "items";
  else inner = "none";
  return { outer, inner, outOfFlow: acc.outOfFlow, floats: acc.floats, pseudo: acc.pseudo, pre: acc.pre || defInner === "pre" || acc.descendants };
}

/** An in-flow block-level box at every breakpoint: whitespace next to it always sits at a line's edge. */
export function isSolidBlock(l: Layout): boolean {
  return l.outer.size > 0 && [...l.outer].every((o) => o === "block") && !l.outOfFlow && !l.floats;
}

/** A box of its own in a flex / grid / table parent at every breakpoint (never `none`, never `contents`). */
export function isSolidItem(l: Layout): boolean {
  return l.outer.size > 0 && [...l.outer].every((o) => o === "block" || o === "inline" || o === "table-part") && !l.outOfFlow;
}

/** Block-level or not displayed, at every breakpoint: it never puts inline content next to whitespace. */
export function isBlockOrNone(l: Layout): boolean {
  return l.outer.size > 0 && [...l.outer].every((o) => o === "block" || o === "none");
}

/** Generates a box (or nothing), never lifts its children into the parent: its layout is known. */
export function isKnownBox(l: Layout): boolean {
  return l.outer.size > 0 && [...l.outer].every((o) => o !== "unknown" && o !== "contents");
}
