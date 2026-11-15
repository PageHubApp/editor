/**
 * The one friendly name of a node, shared by the breadcrumb and the layers tree so the two never
 * drift. In order: the author's `data-edit-name` (what a rename writes), else the element
 * definition's insert label (so a tag reads as "Heading" / "Section" / "Button", not "h1" /
 * "section" / "button"); a Liquid block reads as what it does ("Repeat", "Condition"), a `{% render %}` as the
 * component it shows ("Footer"); else the raw tag.
 */
import { EDIT_ATTRIBUTES, type ElementDef, type NodeHandle } from "@pagehub/engine";

/** The element definition behind an element handle (its insert label lives here); null for non-elements. */
const elementDefOf = (h: NodeHandle): ElementDef | null =>
  h.alive && h.kind === "element" ? ((h as unknown as { element?: ElementDef }).element ?? null) : null;

/** Liquid blocks by what they do (the inspector's panel titles). */
const LIQUID_NAMES: Readonly<Record<string, string>> = { for: "Repeat", tablerow: "Repeat", if: "Show only when", unless: "Show only when", case: "Choose one", paginate: "Pagination", form: "Form", section: "Section", capture: "Saved text", raw: "Code as written", comment: "Note" };

/** `site-header` → "Site header". */
export const humanize = (name: string) => {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The component a `{% render 'name' %}` / `{% include %}` shows; null when it's picked by a variable. */
function renderedName(h: NodeHandle): string | null {
  if (h.kind !== "liquid-tag" || (h.tag !== "render" && h.tag !== "include")) return null;
  const snippet = (h.node() as { node?: { markup?: { snippet?: { type?: string; value?: string } } } }).node?.markup?.snippet;
  return snippet?.type === "String" && snippet.value ? humanize(snippet.value) : null;
}

/** A node's label: `data-edit-name`, else the element's insert label, else a Liquid node's friendly name, else the tag. */
export function nodeName(h: NodeHandle): string {
  const name = h.kind === "element" ? h.attr(EDIT_ATTRIBUTES.name)?.trim() : undefined;
  if (name) return name;
  if (h.kind === "element") return elementDefOf(h)?.insert?.label || h.tag;
  return renderedName(h) ?? ((h.kind === "liquid-block" && LIQUID_NAMES[h.tag]) || (h.tag === "render" || h.tag === "include" ? "Component" : h.tag));
}
