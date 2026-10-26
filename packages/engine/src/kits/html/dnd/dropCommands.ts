/**
 * The drag-and-drop commands. Each builds the whole drop as one transaction (one undo step),
 * is pure (the dry run builds and validates the same edit and changes nothing), and refuses
 * what the drop rules refuse.
 *
 *   element.move        { nodes?, to, copy?, align? }   move (or Shift-copy) to a drop point
 *   layout.dropBeside   { nodes? | snippet, target, side, copy? }   split into a row
 *   layout.alignOnDrop  { at?, intent }                  alignment for a node in place
 *   layout.automaticMorph { at? }                        turn a container into what its parent needs
 * New nodes drop through `element.insert { …, to, automatic? }`.
 */
import { defineCommand, selectAfter, type CommandContext } from "../../../commands/defineCommand";
import { indentAt, reindent } from "../../../edit/whitespace";
import { setSelection } from "../../../state/state";
import type { NodeHandle } from "../../../state/handles";
import { edit, lateElementAt, primary } from "../commandEdit";
import { childrenOf, inserted, snippetNodes, snippetOf, withoutEditIds } from "../nodes";
import { uniqueIds } from "../uniqueIds";
import { automaticSnippet, morphKind } from "./automatic";
import { itemClass, itemMarkup, planBeside, rowClass, rowMarkup, snippetWithout } from "./beside";
import { canDropInto, type Dragged } from "./dropRules";
import { applyAlign, cleanupWrappers, coerceSectionDrop, resolveDrop, type DropTo } from "./dropEdits";
import { isAncestorOrSelf, layoutClasses, roleOf, type AlignIntent, type BesideSide } from "./layout";

const selected = (ctx: CommandContext, nodes?: readonly NodeHandle[]): NodeHandle[] =>
  (nodes ?? ctx.selection.handles).filter((h) => h.alive);

const asCopies = (nodes: readonly NodeHandle[]): Dragged[] => nodes.map((h) => ({ tag: h.tag, kind: h.kind === "element" ? "element" : h.kind === "liquid-block" ? "liquid-block" : "text" }));

/**
 * Top-level tags of new markup, for the drop rules. A standalone Liquid tag (`{% render 'card' %}`, a component
 * instance) places like a block: it may sit anywhere an element may, the top of a page file included.
 */
export function draggedOfSnippet(ctx: CommandContext, snippet: string): Dragged[] | null {
  const nodes = snippetNodes(ctx.state, snippet);
  return nodes?.length
    ? nodes.map((n) => (n.kind === "content" ? (n.type === "LiquidTag" ? { tag: "#liquid", kind: "liquid-block" as const } : { tag: "#text", kind: "text" as const }) : { tag: n.tag, kind: n.kind }))
    : null;
}

/** Resolve a drop point for `dragged` (a top-level section is redirected into the page) and check the rules. */
export function dropPoint(ctx: CommandContext, to: DropTo, dragged: readonly Dragged[]) {
  if (!ctx.registry) return null;
  let drop = resolveDrop(ctx.registry, to);
  if (drop && dragged.some((d) => ("handle" in d ? roleOf(d.handle) : roleOf({ kind: "element", tag: d.tag } as NodeHandle)) === "section")) drop = coerceSectionDrop(ctx.registry, drop);
  return drop && canDropInto(ctx.state, drop.parent, dragged) ? drop : null;
}

export interface MoveArgs {
  nodes?: readonly NodeHandle[];
  to: DropTo;
  /** Shift held: drop copies, select the last one. */
  copy?: boolean;
  /** Alignment intent; applied only when the nodes stay in the same parent. */
  align?: AlignIntent | null;
}

export const moveElement = defineCommand<MoveArgs>({
  id: "element.move",
  title: "Move",
  run(ctx, args) {
    const nodes = selected(ctx, args?.nodes);
    if (!args || !nodes.length) return false;
    const drop = dropPoint(ctx, args.to, args.copy ? asCopies(nodes) : nodes.map((handle) => ({ handle })));
    if (!drop) return false;
    if (args.copy) {
      const snippet = nodes.map((h) => withoutEditIds(snippetOf(ctx.state, h))).join("\n");
      return edit(ctx, (tr) => {
        tr.insert(drop.at, snippet);
        tr.effect(setSelection, selectAfter(() => inserted(drop.at, nodes.length, ctx.registry).slice(-1)));
      });
    }
    const sameParent = nodes.every((h) => h.parent() === drop.parent);
    return edit(ctx, (tr) => {
      nodes.forEach((h, i) => tr.move(h, i ? { after: nodes[i - 1]! } : drop.at));
      if (!sameParent) cleanupWrappers(tr, ctx.state, nodes, drop.parent);
      if (args.align && sameParent) for (const h of nodes) applyAlign(tr, ctx.state, h, drop.parent, args.align);
      tr.effect(setSelection, { handles: nodes });
    });
  },
});

export interface BesideArgs {
  /** Existing nodes (default: the selection); or `snippet` for new markup. */
  nodes?: readonly NodeHandle[];
  snippet?: string;
  target: NodeHandle;
  side: BesideSide;
  copy?: boolean;
}

export const dropBeside = defineCommand<BesideArgs>({
  id: "layout.dropBeside",
  title: "Place beside",
  run(ctx, args) {
    if (!args?.target?.alive) return false;
    const nodes = args.snippet === undefined ? selected(ctx, args.nodes) : [];
    if (args.snippet === undefined && (!nodes.length || nodes.some((h) => isAncestorOrSelf(h, args.target)))) return false;
    const plan = planBeside(ctx.state, args.target);
    if (!plan) return false;
    const dragged = args.snippet !== undefined ? draggedOfSnippet(ctx, args.snippet) : args.copy ? asCopies(nodes) : nodes.map((handle) => ({ handle }));
    if (!dragged || !canDropInto(ctx.state, plan.row ?? plan.target.parent(), dragged)) return false;
    const body = (args.snippet === undefined ? undefined : uniqueIds(ctx.state, args.snippet)) ?? nodes.map((h) => (args.copy ? withoutEditIds(snippetOf(ctx.state, h)) : snippetOf(ctx.state, h))).join("\n");
    const lead = nodes[0] ?? null;
    const moving = args.copy ? [] : nodes;
    const item = itemMarkup(itemClass(ctx.state, lead, args.side, plan.promoted ? "promoted-dragged" : "default"), body);
    const left = args.side === "left";

    if (plan.row && plan.anchor) {
      const { row, anchor } = plan;
      return edit(ctx, (tr) => {
        for (const h of moving) tr.remove(h);
        tr.insert(left ? { before: anchor } : { after: anchor }, item);
        cleanupWrappers(tr, ctx.state, moving, row);
        tr.effect(setSelection, { handles: [row] });
      });
    }
    const t = plan.target;
    const inside = moving.filter((h) => isAncestorOrSelf(t, h));
    const outside = moving.filter((h) => !inside.includes(h));
    const targetItem = itemMarkup(itemClass(ctx.state, t, args.side, plan.promoted ? "promoted-target" : "default"), snippetWithout(ctx.state, t, inside));
    const rowCls = rowClass(ctx.state, args.side, [t.parent(), t, lead], plan.promoted);
    const text = ctx.state.files.get(t.path)!;
    const markup = reindent(rowMarkup(rowCls, left ? [item, targetItem] : [targetItem, item]), "", indentAt(text, t.range.from));
    const sel = lateElementAt(ctx, t.path, t.range.from);
    return edit(ctx, (tr) => {
      for (const h of outside) tr.remove(h);
      tr.replace(t, markup);
      cleanupWrappers(tr, ctx.state, outside, t);
      tr.effect(setSelection, selectAfter(sel.resolve));
      sel.bind(tr);
    });
  },
});

export const alignOnDrop = defineCommand<{ at?: NodeHandle; intent: AlignIntent }>({
  id: "layout.alignOnDrop",
  title: "Align",
  run(ctx, args) {
    const h = args?.at ?? primary(ctx);
    if (!h?.alive || !args?.intent) return false;
    return edit(ctx, (tr) => applyAlign(tr, ctx.state, h, h.parent(), args.intent));
  },
});

export const automaticMorph = defineCommand<{ at?: NodeHandle } | undefined>({
  id: "layout.automaticMorph",
  title: "Automatic layout",
  run(ctx, args) {
    const h = args?.at ?? primary(ctx);
    if (!h?.alive || h.kind !== "element" || roleOf(h)) return false;
    const c = layoutClasses(ctx.state);
    const kind = morphKind(ctx.state, h.parent());
    return edit(ctx, (tr) => {
      if (kind === "section") {
        tr.setTagName(h, "section").setAttr(h, "class", c.section);
        if (!childrenOf(h).length) tr.insert({ append: h }, `<div class="${c.content}"></div>`);
      } else tr.setAttr(h, "class", c[kind]);
    });
  },
});

/** Markup for `element.insert { automatic: true }` at a drop point. */
export function automaticAt(ctx: CommandContext, to: DropTo): string | null {
  const drop = ctx.registry && resolveDrop(ctx.registry, to);
  return drop ? automaticSnippet(ctx.state, drop.parent) : null;
}

export const DND_COMMANDS = [moveElement, dropBeside, alignOnDrop, automaticMorph] as const;
