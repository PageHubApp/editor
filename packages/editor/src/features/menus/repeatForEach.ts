/**
 * `element.repeatForEach` ("Repeat for each…"): wraps the selected element in
 * `{% for item in items %}` (`liquid.wrapFor`), one undo step. The loop is then edited in the
 * inspector's Data source row. Not a canvas context-menu row.
 */
import { commandsFacet, defineCommand, type Extension } from "@pagehub/engine";
import { CONTEXT_MENU_KIT } from "./contextMenuKit";
import { wrapperOf } from "../liquid/markup";

/** Starting loop; the inspector's loop panel renames both. */
const DEFAULT_LOOP = { item: "item", collection: "items" } as const;

export const repeatForEach = defineCommand({
  id: "element.repeatForEach",
  title: "Repeat for each…",
  run(ctx) {
    const h = ctx.selection.primary;
    const wrap = ctx.state.facet(commandsFacet).get("liquid.wrapFor");
    if (!h?.alive || h.kind !== "element" || !wrap || wrapperOf(h, ["for"])) return false;
    return wrap.run(ctx, { ...DEFAULT_LOOP });
  },
});

export const REPEAT_FOR_EACH_KIT: Extension = [repeatForEach, CONTEXT_MENU_KIT];
