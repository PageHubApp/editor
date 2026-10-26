/**
 * The one friendly name of a node, shared by the breadcrumb and the layers tree so the two never
 * drift. In order: the author's `data-edit-name` (what a rename writes), else the element
 * definition's insert label (so a tag reads as "Heading" / "Section" / "Button", not "h1" /
 * "section" / "button"), else the raw tag (a Liquid block shows its tag, e.g. `{% for %}` → "for").
 */
import { EDIT_ATTRIBUTES, type ElementDef, type NodeHandle } from "@pagehub/engine";

/** The element definition behind an element handle (its insert label lives here); null for non-elements. */
const elementDefOf = (h: NodeHandle): ElementDef | null =>
  h.alive && h.kind === "element" ? ((h as unknown as { element?: ElementDef }).element ?? null) : null;

/** A node's label: `data-edit-name`, else the element's insert label, else the tag. */
export function nodeName(h: NodeHandle): string {
  const name = h.kind === "element" ? h.attr(EDIT_ATTRIBUTES.name)?.trim() : undefined;
  return name || elementDefOf(h)?.insert?.label || h.tag;
}
