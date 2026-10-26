/**
 * `classes.layers({ group, at, layers })` — write one class group at several breakpoint layers
 * in a single transaction: the breakpoint chip's reset-all, promote-to-base and copy up / down.
 * One command = one write = one undo step.
 * Layers are written base-first in the order given; `token: null` removes that layer's token.
 */
import { defineCommand, groupTest, splitClass, type ClassGroup, type EditorState, type NodeHandle } from "@pagehub/engine";
import { BREAKPOINTS, classGroupsFacet, scopePrefix, setClasses, type Breakpoint, type Scope } from "@pagehub/engine/kits";

interface ClassLayersArgs {
  group: string;
  at: NodeHandle;
  layers: ReadonlyArray<{ breakpoint?: Breakpoint; token: string | null }>;
}

const TOKEN = /^[^\s"'<>{}]+$/;

export const classLayers = defineCommand<ClassLayersArgs>({
  id: "classes.layers",
  title: "Set style at breakpoints",
  run(ctx, args) {
    const group = args && ctx.state.facet(classGroupsFacet).get(args.group);
    const h = args?.at;
    if (!group || !h?.alive || h.kind !== "element" || !args.layers.length) return false;
    if (/[{}]/.test(h.attr("class") ?? "")) return false; // Liquid in class: edited as source
    if (args.layers.some((l) => l.token !== null && !TOKEN.test(l.token))) return false;
    const before = h.classes();
    const after = args.layers.reduce<readonly string[]>((cls, l) => setClasses(cls, group, l.token, [{ breakpoint: l.breakpoint }]), before);
    if (after.join(" ") === before.join(" ")) return false;
    ctx.tr.setAttr(h, "class", after.length ? after.join(" ") : null);
    ctx.tr.done();
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

const BPS: readonly string[] = BREAKPOINTS;
const groupFor = (state: EditorState, base: string): ClassGroup | undefined => [...state.facet(classGroupsFacet).values()].find((g) => groupTest(g)(base));
/** The element a chip command writes, or null (not an element, or Liquid in its class). */
const writable = (h: NodeHandle | undefined) => (h?.alive && h.kind === "element" && !/[{}]/.test(h.attr("class") ?? "") ? h : null);

interface ClassAddArgs {
  /** The full class token, prefixes included (`md:flex`). */
  token: string;
  at: NodeHandle;
}

/**
 * Append one class token to an element — the Classes editor's add input, for a token the engine's
 * class groups don't recognise (a known class is placed with `classes.set` for conflict + scope
 * handling; this is the raw escape hatch, since `attr.set` refuses the `class` attribute). No-op
 * if the token is already present.
 */
export const classAdd = defineCommand<ClassAddArgs>({
  id: "classes.add",
  title: "Add class",
  run(ctx, args) {
    const h = writable(args?.at);
    if (!h || !args.token || !TOKEN.test(args.token)) return false;
    const before = h.classes();
    if (before.includes(args.token)) return false;
    ctx.tr.setAttr(h, "class", [...before, args.token].join(" "));
    ctx.tr.done();
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

interface ClassRemoveLinkedArgs {
  token: string;
  at: NodeHandle;
}

/** Ctrl + right-click on a class chip: the class and every token of its group at any breakpoint, dark or state. */
export const classRemoveLinked = defineCommand<ClassRemoveLinkedArgs>({
  id: "classes.removeLinked",
  title: "Remove class and its linked classes",
  run(ctx, args) {
    const h = writable(args?.at);
    if (!h || !args.token) return false;
    const before = h.classes();
    if (!before.includes(args.token)) return false;
    const group = groupFor(ctx.state, splitClass(args.token)[1]);
    const match = group && groupTest(group);
    const after = before.filter((c) => c !== args.token && !(match && match(splitClass(c)[1])));
    ctx.tr.setAttr(h, "class", after.length ? after.join(" ") : null);
    ctx.tr.done();
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

interface ClassMoveArgs {
  token: string;
  /** The layer to land on: a breakpoint, or `base` for mobile. */
  to: Breakpoint | "base";
  /** Keep the original (Shift + drag, or an armed Shift + click). */
  copy?: boolean;
  at: NodeHandle;
}

/**
 * A class chip dropped on another breakpoint: its token is re-written there (dark and state
 * prefixes kept), replacing that layer's token of the same group; moved unless `copy`.
 */
export const classMove = defineCommand<ClassMoveArgs>({
  id: "classes.move",
  title: "Move class to breakpoint",
  run(ctx, args) {
    const h = writable(args?.at);
    if (!h || !args.token || !(args.to === "base" || BPS.includes(args.to))) return false;
    const before = h.classes();
    if (!before.includes(args.token)) return false;
    const [prefix, base] = splitClass(args.token);
    const rest = prefix.split(":").filter((p) => p && !BPS.includes(p));
    const scope: Scope = { breakpoint: args.to === "base" ? undefined : args.to, dark: rest.includes("dark"), state: rest.find((p) => p !== "dark") };
    const from = prefix.split(":").find((p) => BPS.includes(p)) ?? "base";
    if (from === args.to) return false;
    const kept = args.copy ? before : before.filter((c) => c !== args.token);
    const group = groupFor(ctx.state, base);
    const target = scopePrefix(scope) + base;
    const after = group ? setClasses(kept, group, base, [scope], ctx.state.facet(classGroupsFacet)) : [...kept.filter((c) => c !== target), target];
    if (after.join(" ") === before.join(" ")) return false;
    ctx.tr.setAttr(h, "class", after.length ? after.join(" ") : null);
    ctx.tr.done();
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});
