/**
 * Commands the Liquid block panels write through. Each is one transaction of minimal
 * splices, so a panel change is one undo step and only the bytes that differ move:
 *
 * - `liquid.setMarkup { markup, branch?, at? }` — the expression of a block's open tag
 *   (`{% for p in products %}` → `p in products reversed`), or of its `branch`-th branch tag
 *   (`{% elsif … %}`, `{% when … %}`).
 * - `liquid.addBranch { branch, markup?, at? }` — `else` (if / unless / case / for), `elsif`
 *   (if / unless) or `when` (case), placed before an existing `else`, else before the close tag.
 * - `liquid.removeBranch { index, at? }` — a branch tag and its body (index ≥ 1).
 * - `liquid.unwrap { at? }` — a single-branch block's tags, its body re-indented one level out
 *   (the inverse of `liquid.wrapIf` / `liquid.wrapFor`).
 * - `source.replace { text, at?, path? }` — a node's (or a whole file's) source, as line
 *   splices against the current text (the code view's save).
 *
 * `at` defaults to the primary selection.
 */
import { defineCommand, type CommandContext } from "../../commands/defineCommand";
import { EditError, INDENT_UNIT, lineSplices, type Splice } from "../../edit/ops";
import { indentAt, ownsLineEnd, ownsLineStart, reindent } from "../../edit/whitespace";
import { isSafeExpression } from "../../schema/t";
import { parserTagsFacet } from "../../extensions/facets";
import { parseSource } from "../../parse/parse";
import type { Environment } from "../../parse/environment";
import { diffSplices } from "../../storage/diff";
import type { Range } from "../../parse/parse";
import type { BlockTreeNode, TreeNode } from "../../parse/tree";
import type { NodeHandle } from "../../state/handles";
import type { TransactionBuilder } from "../../state/builder";

/** Run `fn` on the transaction; an `EditError` (or a result that no longer parses) means "can't". */
export function build(ctx: CommandContext, fn: (tr: TransactionBuilder) => void): boolean {
  try {
    fn(ctx.tr);
    ctx.tr.done();
  } catch (e) {
    if (e instanceof EditError) return false;
    throw e;
  }
  ctx.dispatch?.(ctx.tr);
  return true;
}

const isLiquid = (h: NodeHandle | null | undefined): h is NodeHandle => !!h?.alive && (h.kind === "liquid-block" || h.kind === "liquid-tag");

/** The Liquid handle a command acts on: `at`, else the primary selection. */
export function liquidTarget(ctx: CommandContext, at?: NodeHandle): NodeHandle | null {
  const h = at ?? ctx.selection.primary;
  return isLiquid(h) ? h : null;
}

/** The open-tag range of a Liquid node (a block's `{% for … %}`, or a whole `{% render … %}`). */
export function openTagOf(n: TreeNode): Range {
  return n.kind === "liquid-block" ? n.openTag : n.range;
}

/** The markup inside a tag's delimiters, after its name: `{%- if a > 1 -%}` → `a > 1`. */
export function markupRange(source: string, tag: Range): { from: number; to: number } {
  const text = source.slice(tag.start, tag.end);
  const head = /^\{%-?\s*[a-z_]+\s*/i.exec(text)?.[0].length ?? 0;
  const tail = /\s*-?%\}$/.exec(text)?.[0].length ?? 0;
  return { from: tag.start + head, to: Math.max(tag.start + head, tag.end - tail) };
}

/** The range of the `index`-th branch tag (`{% elsif … %}` / `{% when … %}` / `{% else %}`). */
export function branchTagRange(source: string, block: BlockTreeNode, index: number): Range | null {
  const b = block.branches[index];
  if (!b || index === 0) return null;
  const end = source.indexOf("%}", b.range.start);
  return end < 0 ? null : { start: b.range.start, end: end + 2 };
}

/** One splice trimmed to the bytes that differ. */
function minimal(from: number, old: string, next: string): Splice {
  let p = 0;
  while (p < old.length && p < next.length && old[p] === next[p]) p++;
  let q = 0;
  while (q < old.length - p && q < next.length - p && old[old.length - 1 - q] === next[next.length - 1 - q]) q++;
  return { from: from + p, to: from + old.length - q, insert: next.slice(p, next.length - q) };
}

function splice(tr: TransactionBuilder, path: string, splices: Splice[]): void {
  if (!splices.length) throw new EditError("nothing to change");
  for (const s of splices) tr.replace({ path, from: s.from, to: s.to }, s.insert);
}

/**
 * Whether `markup` parses to the tag's grammar (`p in products`), not the parser's raw-string
 * fallback (`p in`). Checked on a one-tag snippet; `branch` names a branch tag inside `tag`.
 */
function markupParses(env: Environment, tag: string, block: boolean, branch: string | null, markup: string): boolean {
  const src = branch ? `{% ${tag} x %}{% ${branch} ${markup} %}{% end${tag} %}` : block ? `{% ${tag} ${markup} %}{% end${tag} %}` : `{% ${tag} ${markup} %}`;
  try {
    const n = parseSource(src, "strict", { env }).children[0] as unknown as { markup?: unknown; children?: Array<{ markup?: unknown }> };
    return typeof (branch ? n.children?.[1]?.markup : n.markup) !== "string";
  } catch {
    return false;
  }
}

const block = (h: NodeHandle): BlockTreeNode | null => {
  const n = h.node();
  return n.kind === "liquid-block" ? n : null;
};

export const setMarkup = defineCommand<{ markup: string; branch?: number; at?: NodeHandle }>({
  id: "liquid.setMarkup",
  title: "Set Liquid expression",
  run(ctx, args) {
    const h = liquidTarget(ctx, args?.at);
    if (!h || !args || !isSafeExpression(args.markup)) return false;
    const source = ctx.tr.text(h.path);
    const n = h.node();
    const tag = args.branch ? (n.kind === "liquid-block" ? branchTagRange(source, n, args.branch) : null) : openTagOf(n);
    if (!tag) return false;
    const r = markupRange(source, tag);
    const old = source.slice(r.from, r.to);
    const next = args.markup.trim();
    if (old === next) return false;
    const env = ctx.tr.startState.facet(parserTagsFacet);
    const branch = args.branch && n.kind === "liquid-block" ? n.branches[args.branch]!.name : null;
    // a markup that parses today must still parse after the edit
    if (markupParses(env, h.tag, n.kind === "liquid-block", branch, old) && !markupParses(env, h.tag, n.kind === "liquid-block", branch, next)) return false;
    // `{% else %}` has no markup: write one after the name
    const at = r.from === r.to && !/\s$/.test(source.slice(tag.start, r.from)) ? { from: r.from, insert: ` ${next}` } : null;
    return build(ctx, (tr) => splice(tr, h.path, [at ? { from: at.from, to: at.from, insert: at.insert } : minimal(r.from, old, next)]));
  },
});

const BRANCHES: Record<string, ReadonlySet<string>> = {
  else: new Set(["if", "unless", "case", "for"]),
  elsif: new Set(["if", "unless"]),
  when: new Set(["case"]),
};

export const addBranch = defineCommand<{ branch: "else" | "elsif" | "when"; markup?: string; at?: NodeHandle }>({
  id: "liquid.addBranch",
  title: "Add branch",
  run(ctx, args) {
    const h = liquidTarget(ctx, args?.at);
    const b = h && block(h);
    if (!h || !b || !args || !BRANCHES[args.branch]?.has(b.tag)) return false;
    const needsMarkup = args.branch !== "else";
    if (needsMarkup !== (args.markup !== undefined) || (needsMarkup && !isSafeExpression(args.markup))) return false;
    if (needsMarkup && !markupParses(ctx.tr.startState.facet(parserTagsFacet), b.tag, true, args.branch, args.markup!.trim())) return false;
    const elseBranch = b.branches.find((x) => x.name === "else");
    if (args.branch === "else" && elseBranch) return false;
    const source = ctx.tr.text(h.path);
    const x = elseBranch ? elseBranch.range.start : b.closeTag.start;
    const tag = `{% ${args.branch}${needsMarkup ? ` ${args.markup!.trim()}` : ""} %}`;
    const insert = ownsLineStart(source, x) ? `${tag}\n${indentAt(source, x)}` : tag;
    return build(ctx, (tr) => splice(tr, h.path, [{ from: x, to: x, insert }]));
  },
});

export const removeBranch = defineCommand<{ index: number; at?: NodeHandle }>({
  id: "liquid.removeBranch",
  title: "Remove branch",
  run(ctx, args) {
    const h = liquidTarget(ctx, args?.at);
    const b = h && block(h);
    const branch = b && args && args.index >= 1 ? b.branches[args.index] : undefined;
    if (!h || !branch) return false;
    // the body ends right before the next tag, so the indent of that tag's line stays
    return build(ctx, (tr) => splice(tr, h.path, [{ from: branch.range.start, to: branch.range.end, insert: "" }]));
  },
});

export const unwrap = defineCommand<{ at?: NodeHandle }>({
  id: "liquid.unwrap",
  title: "Remove wrapper",
  run(ctx, args) {
    const h = liquidTarget(ctx, args?.at);
    const b = h && block(h);
    if (!h || !b || b.branches.length !== 1) return false;
    const source = ctx.tr.text(h.path);
    const body = b.branches[0]!.range;
    const inner = source.slice(body.start, body.end);
    const from = body.start + (inner.length - inner.trimStart().length);
    const to = body.end - (inner.length - inner.trimEnd().length);
    const { openTag, closeTag } = b;
    if (from >= to) return build(ctx, (tr) => void tr.remove(h));
    if (!(ownsLineStart(source, openTag.start) && ownsLineEnd(source, closeTag.end))) {
      return build(ctx, (tr) => splice(tr, h.path, [{ from: openTag.start, to: from, insert: "" }, { from: to, to: closeTag.end, insert: "" }]));
    }
    const indent = indentAt(source, openTag.start);
    const text = source.slice(from, to);
    return build(ctx, (tr) =>
      splice(tr, h.path, [
        { from: openTag.start, to: from, insert: "" },
        ...lineSplices(text, reindent(text, indent + INDENT_UNIT, indent), from),
        { from: to, to: closeTag.end, insert: "" },
      ]),
    );
  },
});

export const replaceSource = defineCommand<{ text: string; at?: NodeHandle; path?: string }>({
  id: "source.replace",
  title: "Replace source",
  run(ctx, args) {
    if (!args || typeof args.text !== "string") return false;
    const h = args.at ?? (args.path ? null : ctx.selection.primary);
    if (h && !h.alive) return false;
    const path = h ? h.path : args.path!;
    let source: string;
    try {
      source = ctx.tr.text(path);
    } catch {
      return false;
    }
    const base = h ? h.range.from : 0;
    const old = h ? h.text() : source;
    if (old === args.text) return false;
    const splices = diffSplices(old, args.text).map((s) => ({ ...s, from: s.from + base, to: s.to + base }));
    return build(ctx, (tr) => splice(tr, path, splices));
  },
});

/** Splice removing the named argument `name: value` and its separator; null when absent. */
export function removeArgSplice(source: string, h: NodeHandle, name: string): Splice | null {
  const arg = h.args().find((a) => a.name === name);
  if (!arg) return null;
  let from = source.lastIndexOf(name, arg.range.start);
  let to = arg.range.end;
  let p = from;
  while (p > 0 && /[ \t]/.test(source[p - 1]!)) p--;
  if (source[p - 1] === ",") from = p - 1;
  else {
    let q = to;
    while (/[ \t]/.test(source[q] ?? "")) q++;
    if (source[q] === ",") {
      to = q + 1;
      while (/[ \t]/.test(source[to] ?? "")) to++;
    } else from = p;
  }
  return { from, to, insert: "" };
}

export const BLOCK_COMMANDS = [setMarkup, addBranch, removeBranch, unwrap, replaceSource] as const;
