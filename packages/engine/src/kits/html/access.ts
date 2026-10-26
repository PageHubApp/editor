/**
 * Who may be copied, duplicated, cut or deleted: the document's own elements (`html`, `head`,
 * `body`) never, and any element locked with `data-edit-lock="delete"` (or `sealed`) not either.
 * Copy shares the delete rule — an element you can't remove you can't clone.
 */
import type { CommandContext } from "../../commands/defineCommand";
import type { NodeHandle } from "../../state/handles";
import { primary } from "./commandEdit";
import { locked } from "./nodes";

const DOCUMENT_TAGS: ReadonlySet<string> = new Set(["html", "head", "body"]);

export const isDocumentElement = (h: NodeHandle): boolean => h.kind === "element" && DOCUMENT_TAGS.has(h.tag.toLowerCase());

/** The node may be deleted (and so cut). */
export const removable = (h: NodeHandle): boolean => !isDocumentElement(h) && !locked(h, "delete");

/** The selection when a copy-like command may use it: removable, and not while typing in a text leaf. */
export const copyable = (ctx: CommandContext): NodeHandle | null => {
  const h = ctx.ui.textEditing ? null : primary(ctx);
  return h && removable(h) ? h : null;
};
