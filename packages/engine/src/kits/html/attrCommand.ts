/**
 * `attr.set({ name, value, at? })` — set or remove one HTML attribute on an element (the
 * inspector's attribute rows). `value: null` removes it; `""` writes a boolean attribute.
 * One command = one write = one undo step.
 *
 *   store.run("attr.set", { name: "alt", value: "A red door" })
 *   store.run("attr.set", { name: "loading", value: null, at: handle })
 *
 * Refused: `class` (classes go through `classes.set`), Liquid in a value, invalid names, and `data-edit-*` values
 * their validator rejects. `on*` handlers and `javascript:` URLs are the site's own code and are written as given.
 */
import { defineCommand } from "../../commands/defineCommand";
import { EDIT_ATTRIBUTES, validateEditAttribute } from "../../attributes/editAttributes";
import { EditError } from "../../edit/ops";
import type { NodeHandle } from "../../state/handles";

export interface AttrSetArgs {
  name: string;
  value: string | null;
  /** Element to write; default the primary selection. */
  at?: NodeHandle;
}

const NAME = /^[a-z_:][\w:.-]*$/i;
const EDIT = new Set<string>(Object.values(EDIT_ATTRIBUTES));

export const attrSet = defineCommand<AttrSetArgs>({
  id: "attr.set",
  title: "Set attribute",
  run(ctx, args) {
    const h = args?.at ?? ctx.selection.primary;
    if (!args || !h?.alive || h.kind !== "element") return false;
    const name = args.name?.toLowerCase() ?? "";
    if (!NAME.test(name) || name === "class") return false;
    const v = args.value;
    if (v !== null && /[{}]/.test(v)) return false;
    if (v !== null && EDIT.has(name) && validateEditAttribute(name, v)) return false;
    if ((h.attr(name) ?? null) === v) return false;
    try {
      ctx.tr.setAttr(h, name, v);
      ctx.tr.done();
    } catch (e) {
      if (e instanceof EditError) return false;
      throw e;
    }
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});
