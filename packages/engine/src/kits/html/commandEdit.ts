/**
 * What every html-kit command shares: the live primary selection, and `edit()` — build an edit,
 * return false when it throws an `EditError` or leaves a file unparseable, and dispatch only on
 * a real run (so the dry run changes nothing).
 */
import type { CommandContext } from "../../commands/defineCommand";
import { EditError } from "../../edit/ops";
import type { TransactionBuilder } from "../../state/builder";
import type { NodeHandle } from "../../state/handles";
import type { Path } from "../../state/changes";

export const primary = (ctx: CommandContext): NodeHandle | null => {
  const h = ctx.selection.primary;
  return h && h.alive ? h : null;
};

export function edit(ctx: CommandContext, build: (tr: TransactionBuilder) => boolean | void): boolean {
  try {
    if (build(ctx.tr) === false) return false;
    ctx.tr.done();
  } catch (e) {
    if (e instanceof EditError) return false;
    throw e;
  }
  ctx.dispatch?.(ctx.tr);
  return true;
}

/**
 * A position in the start state, mapped through the finished edit: call `bind(tr)` as the last
 * step of a build, then `resolve()` (inside `selectAfter`) gives the element starting there.
 */
export function lateElementAt(ctx: CommandContext, path: Path, from: number) {
  let pos = from;
  return {
    bind(tr: TransactionBuilder) {
      pos = tr.done().mapping.map(from, path, -1);
    },
    resolve(): NodeHandle[] {
      let h = ctx.registry?.at(path, pos) ?? null;
      while (h && !(h.kind === "element" && h.range.from === pos)) h = h.parent();
      return h ? [h] : [];
    },
  };
}
