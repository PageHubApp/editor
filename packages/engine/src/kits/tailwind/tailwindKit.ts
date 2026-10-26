/**
 * `tailwindKit()`: the class groups and the one write path every style control uses,
 * `classes.set({ group, token, scopes, at? })` — the colour popover, hover colours and
 * multi-scope edits all go through it (fix-table rows). Reads: `readClass`, `classOverrides`.
 */
import { defineCommand, type CommandContext } from "../../commands/defineCommand";
import { EditError } from "../../edit/ops";
import type { Extension } from "../../extensions/extension";
import type { NodeHandle } from "../../state/handles";
import { setClasses, type Scope } from "./classModel";
import { TAILWIND_GROUPS, classGroupsFacet } from "./groups";

export interface ClassesSetArgs {
  /** Class group id (`classGroupsFacet`). */
  group: string;
  /** Token without prefix; null removes the group's token in those scopes. */
  token: string | null;
  /** Scopes written (the inspector's active scopes); default base. */
  scopes?: Scope[];
  /** Element to write; default the selection (every selected element). */
  at?: NodeHandle;
}

/** Elements a class command writes: `at`, else the selection. Null when a class attribute holds Liquid (edited as source). */
function classTargets(ctx: CommandContext, at?: NodeHandle): NodeHandle[] | null {
  const targets = (at ? [at] : ctx.selection.handles).filter((h) => h.alive && h.kind === "element");
  return targets.length && !targets.some((h) => /[{}]/.test(h.attr("class") ?? "")) ? targets : null;
}

export const classesSet = defineCommand<ClassesSetArgs>({
  id: "classes.set",
  title: "Set style",
  run(ctx, args) {
    const group = args && ctx.state.facet(classGroupsFacet).get(args.group);
    if (!group) return false;
    if (args.token !== null && (!/^[^\s"'<>{}]+$/.test(args.token) || !(group.match ?? ((t: string) => !!group.values?.includes(t)))(args.token))) return false;
    const groups = ctx.state.facet(classGroupsFacet);
    const targets = classTargets(ctx, args.at);
    if (!targets) return false;
    let changed = false;
    try {
      for (const h of targets) {
        const before = h.classes();
        const after = setClasses(before, group, args.token, args.scopes ?? [{}], groups);
        if (after.join(" ") === before.join(" ")) continue;
        ctx.tr.setAttr(h, "class", after.length ? after.join(" ") : null);
        changed = true;
      }
      if (changed) ctx.tr.done();
    } catch (e) {
      if (e instanceof EditError) return false;
      throw e;
    }
    if (changed) ctx.dispatch?.(ctx.tr);
    return changed;
  },
});

export interface ClassesRemoveArgs {
  /** The class token exactly as written, prefixes included (`md:hover:p-4`). */
  token: string;
  /** Element to write; default the selection. */
  at?: NodeHandle;
}

/** Removes one class token (every copy of it) from each target; `classes.set` is per group. One undo step. */
export const classesRemove = defineCommand<ClassesRemoveArgs>({
  id: "classes.remove",
  title: "Remove class",
  run(ctx, args) {
    const targets = args && typeof args.token === "string" && args.token ? classTargets(ctx, args.at) : null;
    if (!targets) return false;
    let changed = false;
    for (const h of targets) {
      const before = h.classes();
      const after = before.filter((c) => c !== args.token);
      if (after.length === before.length) continue;
      ctx.tr.setAttr(h, "class", after.length ? after.join(" ") : null);
      changed = true;
    }
    if (!changed) return false;
    ctx.tr.done();
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

const DEFAULT: Extension = [classesSet, classesRemove, TAILWIND_GROUPS.map((g) => classGroupsFacet.of(g))];

/** Same value on every call. */
export function tailwindKit(): Extension {
  return DEFAULT;
}
