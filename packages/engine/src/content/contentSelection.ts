/**
 * Content mode selection: a client can select only what they can edit — an element
 * inside (or carrying) `data-editable`, or a `{% section %}` tag. A selection naming anything
 * else is vetoed; clearing the selection and hover are always allowed.
 */
import { beforeTransaction } from "../normalize/hooks";
import { effectsOf, setHover, setSelection } from "../state/state";
import { EDITABLE_ATTRIBUTE } from "../attributes/editAttributes";
import type { NodeHandle } from "../state/handles";
import type { Extension } from "../extensions/extension";

export const CONTENT_SELECTION_HOOK = "content-selection";

/** True when a client may select this node. */
export function isContentTarget(h: NodeHandle): boolean {
  if (h.kind === "liquid-tag") return h.tag === "section";
  for (let n: NodeHandle | null = h; n; n = n.parent()) if (n.kind === "element" && n.attr(EDITABLE_ATTRIBUTE) !== undefined) return true;
  return false;
}

export function contentSelection(): Extension {
  return beforeTransaction(CONTENT_SELECTION_HOOK, (tr) => {
    for (const v of effectsOf(tr, setSelection)) if (v.handles.some((h) => !isContentTarget(h))) return { veto: "not editable" };
    for (const h of effectsOf(tr, setHover)) if (h && !isContentTarget(h)) return { veto: "not editable" };
  });
}
