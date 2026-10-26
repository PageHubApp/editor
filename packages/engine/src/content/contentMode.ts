/**
 * Content mode (`role: "client"`): a `before` hook that vetoes any transaction that
 * changes anything but editable values (see `checkContentOnly`). Remote edits (storage) are
 * not the client's and pass through, as does engine bookkeeping (`system`); effect-only transactions (selection) always pass.
 */
import { beforeTransaction } from "../normalize/hooks";
import { parserTagsFacet } from "../extensions/facets";
import { checkContentOnly } from "./checkContentOnly";
import { contentSelection } from "./contentSelection";
import type { Extension } from "../extensions/extension";

export const CONTENT_MODE_HOOK = "content-mode";

export function contentMode(): Extension {
  return [contentSelection(), contentWrites()];
}

function contentWrites(): Extension {
  return beforeTransaction(CONTENT_MODE_HOOK, (tr, state) => {
    if (tr.changes.empty || tr.annotations.origin === "remote" || tr.annotations.system) return;
    const next = tr.changes.apply(state.files);
    const env = state.facet(parserTagsFacet);
    for (const path of tr.changes.paths) {
      const before = state.files.get(path);
      if (before === undefined) return { veto: `${path}: files may not be added` };
      const r = checkContentOnly(before, next.get(path)!, { bundle: next, env });
      if (!r.ok) return { veto: `${path}: ${r.reason}` };
    }
  });
}
