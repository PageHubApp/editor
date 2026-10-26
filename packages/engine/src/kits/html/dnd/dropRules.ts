/**
 * Where a dragged node may land. One check for every drop path (canvas, layers, insert panel):
 * - a page (`<main>`) only at the top level of a file; a section only into a page, header,
 *   footer or the top level (a component file); a form never inside a form; the top level
 *   takes elements and Liquid blocks only;
 * - never into a void, raw-text or non-element node, never into itself or a descendant;
 * - `data-edit-lock`: `drag` on the node, `move-out` on its parent, `drop-in` on the target;
 * - the target element's `children.allow` / `deny` (element names).
 * Liquid branches are checked by the edit itself (a branched block refuses direct children).
 */
import { elementsFacet } from "../../../extensions/facets";
import type { EditorState } from "../../../state/state";
import type { NodeHandle } from "../../../state/handles";
import { EDIT_ATTRIBUTES } from "../../../attributes/editAttributes";
import { VOID_ELEMENTS, locked } from "../nodes";
import { RAW_ELEMENTS, isAncestorOrSelf, roleOf, type SectionRole } from "./layout";

/** What is being dropped: an existing node, or the top-level tag of new markup. */
export type Dragged = { handle: NodeHandle } | { tag: string; kind: "element" | "liquid-block" | "text" };

const lockWords = (h: NodeHandle | null): string[] => (h?.kind === "element" ? (h.attr(EDIT_ATTRIBUTES.lock) ?? "").split(/\s+/) : []);
const lockedFor = (h: NodeHandle | null, word: string) => {
  const w = lockWords(h);
  return w.includes(word) || w.includes("sealed");
};

const tagOf = (d: Dragged) => ("handle" in d ? d.handle.tag : d.tag);
const kindOf = (d: Dragged) => ("handle" in d ? d.handle.kind : d.kind);
const roleOfDragged = (d: Dragged): SectionRole | null => ("handle" in d ? roleOf(d.handle) : kindOf(d) === "element" ? roleOf({ kind: "element", tag: d.tag } as NodeHandle) : null);

function elementName(state: EditorState, d: Dragged): string | undefined {
  if ("handle" in d) return d.handle.element.name;
  return state.facet(elementsFacet).find((e) => typeof e.match === "string" && e.match.split(/\s*,\s*/).includes(d.tag))?.name;
}

/** May each of `dragged` be dropped into `parent` (null = the top level of the file)? */
export function canDropInto(state: EditorState, parent: NodeHandle | null, dragged: readonly Dragged[]): boolean {
  if (!dragged.length) return false;
  if (parent) {
    if (parent.kind === "text" || parent.kind === "liquid-tag") return false;
    if (parent.kind === "element" && (VOID_ELEMENTS.has(parent.tag) || RAW_ELEMENTS.has(parent.tag))) return false;
    if (lockedFor(parent, "drop-in")) return false;
  }
  const def = parent?.kind === "element" ? parent.element : undefined;
  const inForm = (() => {
    for (let p = parent; p; p = p.parent()) if (p.kind === "element" && p.tag === "form") return true;
    return false;
  })();
  const parentRole = roleOf(parent);
  for (const d of dragged) {
    if ("handle" in d) {
      const h = d.handle;
      if (!h.alive || locked(h, "drag") || lockedFor(h.parent(), "move-out")) return false;
      if (parent && isAncestorOrSelf(h, parent)) return false;
    }
    const role = roleOfDragged(d);
    if (role === "page" && parent) return false;
    if (role === "section" && parent && parentRole !== "page" && parentRole !== "header" && parentRole !== "footer") return false;
    if (!parent && kindOf(d) === "text") return false;
    if (inForm && tagOf(d) === "form") return false;
    const name = elementName(state, d);
    if (def?.children?.allow && !(name && def.children.allow.includes(name))) return false;
    if (def?.children?.deny && name && def.children.deny.includes(name)) return false;
  }
  return true;
}
