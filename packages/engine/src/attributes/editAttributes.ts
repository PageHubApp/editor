/**
 * Attributes the editor understands.
 *
 * `data-edit-*` — editor bookkeeping. Written into source only when the host opts in
 * (`identity: "persisted"` for ids, `blockProvenance` for block slugs) or the author asks
 * (locks, layer names); stripped from published output. `data-edit-src` is canvas-only
 * (source offsets on a throwaway render copy) and never stored.
 *
 * `data-editable` — author markup, written on purpose: marks what a client may change in
 * content mode (`text` | `image` | `link`), alongside `{% schema %}` section settings. It is
 * the author's HTML, so it is not editor bookkeeping and `stripEditAttributes` leaves it.
 */
import MagicString from "magic-string";
import { ATTRIBUTE_TYPES, allNodes, isElement, parseSource, segmentsText, type CompoundNameSegment, type LiquidHtmlNode, type ParseOptions } from "../parse/parse";

export const EDIT_ATTRIBUTE_PREFIX = "data-edit-";

export const EDIT_ATTRIBUTES = {
  /** Stable element identity, unique per site. Only with `identity: "persisted"`; set only by `normalize`. */
  id: "data-edit-id",
  /** Structural locks: space list of LOCK_WORDS, or `sealed`. */
  lock: "data-edit-lock",
  /** Library block slug the section came from (only with the host's `blockProvenance` option). */
  block: "data-edit-block",
  /** Label in layers / outline. */
  name: "data-edit-name",
  /** Canvas-only source offset (`<file>#<offset>`); never stored. */
  src: "data-edit-src",
} as const;

export type EditAttributeName = (typeof EDIT_ATTRIBUTES)[keyof typeof EDIT_ATTRIBUTES];

export const EDIT_ID_PATTERN = /^[a-z][a-z0-9]{5}$/;
export const LOCK_WORDS = ["drag", "delete", "drop-in", "move-out"] as const;
export type LockWord = (typeof LOCK_WORDS)[number];

/** Author-written client-editable marker (content mode). */
export const EDITABLE_ATTRIBUTE = "data-editable";
export const EDITABLE_VALUES = ["text", "image", "link"] as const;
export type EditableValue = (typeof EDITABLE_VALUES)[number];

export function isEditAttribute(name: string): boolean {
  return name.startsWith(EDIT_ATTRIBUTE_PREFIX);
}

/** Null when `value` is valid for the editor attribute `name`, else the reason. */
export function validateEditAttribute(name: string, value: string): string | null {
  switch (name) {
    case EDIT_ATTRIBUTES.id:
      return EDIT_ID_PATTERN.test(value) ? null : `${name} must match ${EDIT_ID_PATTERN}`;
    case EDIT_ATTRIBUTES.lock: {
      const words = value.trim().split(/\s+/);
      if (words.length === 1 && words[0] === "sealed") return null;
      const bad = words.filter((w) => !(LOCK_WORDS as readonly string[]).includes(w));
      return bad.length ? `${name}: unknown lock ${bad.join(", ")} (use ${LOCK_WORDS.join(" ")} or sealed)` : null;
    }
    case EDITABLE_ATTRIBUTE:
      return (EDITABLE_VALUES as readonly string[]).includes(value) ? null : `${name} must be one of ${EDITABLE_VALUES.join(", ")}`;
    case EDIT_ATTRIBUTES.block:
      return /^[a-z0-9][a-z0-9-]*$/.test(value) ? null : `${name} must be a block slug`;
    case EDIT_ATTRIBUTES.name:
      return value.trim() ? null : `${name} must not be empty`;
    case EDIT_ATTRIBUTES.src:
      return `${name} is canvas-only and must not be stored`;
    default:
      return `${name} is not a known editor attribute`;
  }
}

type AttrNode = LiquidHtmlNode & { name: CompoundNameSegment[] };

/**
 * Remove every `data-edit-*` attribute (with the whitespace before it). Used on the publish
 * path before rendering, so published HTML never carries editor bookkeeping.
 */
export function stripEditAttributes(source: string, opts: ParseOptions = {}): string {
  if (!source.includes(EDIT_ATTRIBUTE_PREFIX)) return source;
  const s = new MagicString(source);
  let changed = false;
  for (const [node] of allNodes(parseSource(source, "strict", opts))) {
    if (!isElement(node)) continue;
    for (const attr of node.attributes) {
      if (!ATTRIBUTE_TYPES.has(attr.type) || !isEditAttribute(segmentsText((attr as AttrNode).name))) continue;
      let start = attr.position.start;
      while (start > 0 && /\s/.test(source[start - 1]!)) start--;
      s.remove(start, attr.position.end);
      changed = true;
    }
  }
  return changed ? s.toString() : source;
}
