/**
 * The six edit operations — insert, move, remove, setAttribute, setText, replace. Each one
 * takes the current source plus nodes from a parse of that source, and returns the new
 * source with every byte outside the touched ranges unchanged. They are the editor's undo
 * unit, its autosave diff and (later) its multiplayer channel.
 *
 * Ops never reparse; callers reparse (and lint) the result. Node arguments must come from
 * a parse of exactly `source`.
 */
import {
  ATTRIBUTE_TYPES,
  NodeTypes,
  isBlankText,
  segmentsText,
  type CompoundNameSegment,
  type ElementNode,
  type LiquidBlockNode,
  type LiquidBranch,
  type LiquidHtmlNode,
  type Positioned,
  type Range,
} from "../parse/parse";
import { escapeMarkupText } from "../runtime/escape";
import { indentAt, lineStart, nextLineStart, ownsLineEnd, ownsLineStart, reindent, removalRange } from "./whitespace";

export interface EditResult {
  source: string;
  /** Ranges of the INPUT source that were replaced or removed; zero-width for pure inserts. */
  touched: Range[];
}

/**
 * One text replacement in input coordinates: `[from, to)` becomes `insert`. Every op is
 * built as a list of splices (the change-set layer composes, maps and inverts them); the
 * string-returning ops apply them.
 */
export interface Splice {
  from: number;
  to: number;
  insert: string;
}

export class EditError extends Error {
  override name = "EditError";
}

/** One indent level for content placed into an empty container. */
export const INDENT_UNIT = "  ";

/** A node that holds children: an element, a Liquid branch, or a branchless block (`form`, `paginate`). */
export type ContainerNode = ElementNode | LiquidBranch | LiquidBlockNode;

export type InsertTarget =
  | { anchor: Positioned; where: "before" | "after" }
  | { parent: ContainerNode; where: "prepend" | "append" };

const posOf = (target: Positioned | Range): Range =>
  "position" in target ? target.position : target;

/** Sort splices by position (an insert sorts before a range starting at the same offset) and reject overlaps. */
export function sortSplices(splices: readonly Splice[]): Splice[] {
  const sorted = splices
    .map((s, i) => [s, i] as const)
    .sort(([a, i], [b, j]) => a.from - b.from || (a.to === a.from ? 0 : 1) - (b.to === b.from ? 0 : 1) || i - j)
    .map(([s]) => s);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.from < sorted[i - 1]!.to) throw new EditError("overlapping changes");
  }
  return sorted;
}

/** Apply splices (all in `source` coordinates) to `source`. */
export function applySplices(source: string, splices: readonly Splice[]): string {
  let out = "";
  let pos = 0;
  for (const s of sortSplices(splices)) {
    out += source.slice(pos, s.from) + s.insert;
    pos = s.to;
  }
  return out + source.slice(pos);
}

/**
 * Minimal splices turning `before` into `after` when both have the same lines (a re-indent):
 * per line, only the differing middle is replaced. Offsets are relative to `base`.
 */
export function lineSplices(before: string, after: string, base = 0): Splice[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length !== b.length) return before === after ? [] : [{ from: base, to: base + before.length, insert: after }];
  const out: Splice[] = [];
  let pos = base;
  a.forEach((line, i) => {
    const next = b[i]!;
    if (line !== next) {
      let p = 0;
      while (p < line.length && p < next.length && line[p] === next[p]) p++;
      let q = 0;
      while (q < line.length - p && q < next.length - p && line[line.length - 1 - q] === next[next.length - 1 - q]) q++;
      out.push({ from: pos + p, to: pos + line.length - q, insert: next.slice(p, next.length - q) });
    }
    pos += line.length + 1;
  });
  return out;
}

const done = (source: string, splices: Splice[]): EditResult => ({
  source: applySplices(source, splices),
  touched: splices.map((s) => ({ start: s.from, end: s.to })),
});

/** Children and inner content range of a container node. */
export function containerContent(parent: ContainerNode): { children: LiquidHtmlNode[]; content: Range } {
  if (parent.type === NodeTypes.LiquidBranch) {
    return { children: parent.children, content: { start: parent.blockStartPosition.end, end: parent.position.end } };
  }
  if (parent.type === NodeTypes.LiquidTag) {
    const block = parent as LiquidBlockNode;
    if (block.children.some((c) => c.type === NodeTypes.LiquidBranch)) {
      throw new EditError(`{% ${block.name} %} has branches; insert into one of its branches instead`);
    }
    return { children: block.children, content: { start: block.blockStartPosition.end, end: block.blockEndPosition.start } };
  }
  if (parent.type !== NodeTypes.HtmlElement) throw new EditError(`<${segmentsText(parent.name as never)}> cannot have children`);
  return { children: parent.children, content: { start: parent.blockStartPosition.end, end: parent.blockEndPosition.start } };
}

interface Placement {
  at: number;
  text: string;
  /** Where the snippet starts inside `text`, and its placed (re-indented) source. */
  offset: number;
  placed: string;
}

/** Where (offset) and what (text) to splice so `snippet` lands at `target`. `snippet` is indented from column 0. */
function placement(source: string, snippet: string, target: InsertTarget): Placement {
  const ownLine = (at: number, lead: string, indent: string): Placement => {
    const placed = reindent(snippet, "", indent);
    return { at, text: lead + indent + placed + "\n", offset: lead.length + indent.length, placed };
  };
  const inline = (at: number): Placement => ({ at, text: snippet, offset: 0, placed: snippet });
  if ("parent" in target) {
    const { children, content } = containerContent(target.parent);
    const real = children.filter((c) => !isBlankText(c));
    const edge = target.where === "append" ? real.at(-1) : real[0];
    if (edge) return placement(source, snippet, { anchor: edge, where: target.where === "append" ? "after" : "before" });
    // Empty container: own line before the close when the close sits on its own line, else inline.
    if (ownsLineStart(source, content.end) && lineStart(source, content.end) > content.start) {
      return ownLine(lineStart(source, content.end), "", indentAt(source, content.end) + INDENT_UNIT);
    }
    return inline(content.end);
  }
  const anchor = target.anchor.position;
  const indent = indentAt(source, anchor.start);
  if (target.where === "before") {
    return ownsLineStart(source, anchor.start) ? ownLine(lineStart(source, anchor.start), "", indent) : inline(anchor.start);
  }
  if (ownsLineEnd(source, anchor.end)) {
    const at = nextLineStart(source, anchor.end);
    return ownLine(at, at === source.length && !source.endsWith("\n") ? "\n" : "", indent);
  }
  return inline(anchor.end);
}

export function insertSplices(source: string, snippet: string, target: InsertTarget): Splice[] {
  const { at, text } = placement(source, snippet, target);
  return [{ from: at, to: at, insert: text }];
}

/** Insert `snippet` (source text, indented from column 0) at `target`. */
export function insert(source: string, snippet: string, target: InsertTarget): EditResult {
  return done(source, insertSplices(source, snippet, target));
}

export function removeSplices(source: string, node: Positioned): Splice[] {
  const r = removalRange(source, node.position);
  return [{ from: r.start, to: r.end, insert: "" }];
}

/** Remove a node — with its whole lines when it owns them, so no blank line is left behind. */
export function remove(source: string, node: Positioned): EditResult {
  return done(source, removeSplices(source, node));
}

/** A move's splices, plus where the node lands: its range in the OUTPUT source and its new text. */
export interface MoveSplices {
  splices: Splice[];
  landed: { from: number; to: number; text: string };
}

export function moveSplices(source: string, node: Positioned, target: InsertTarget): MoveSplices {
  const { start, end } = node.position;
  const dest = "parent" in target ? target.parent.position : target.anchor.position;
  if (dest.start >= start && dest.end <= end) throw new EditError("cannot move a node into itself");
  const r = removalRange(source, node.position);
  const snippet = reindent(source.slice(start, end), indentAt(source, start), "");
  const { at, text, offset, placed } = placement(source, snippet, target);
  if (at > r.start && at < r.end) throw new EditError("move target falls inside the moved node's lines");
  const from = (at >= r.end ? at - (r.end - r.start) : at) + offset;
  return {
    splices: [
      { from: r.start, to: r.end, insert: "" },
      { from: at, to: at, insert: text },
    ],
    landed: { from, to: from + placed.length, text: placed },
  };
}

/** Move a node to `target`, re-indented for where it lands. */
export function move(source: string, node: Positioned, target: InsertTarget): EditResult {
  return done(source, moveSplices(source, node, target).splices);
}

export function replaceSplices(target: Positioned | Range, text: string): Splice[] {
  const r = posOf(target);
  return [{ from: r.start, to: r.end, insert: text }];
}

/** Replace a node or range with raw source text. */
export function replace(source: string, target: Positioned | Range, text: string): EditResult {
  return done(source, replaceSplices(target, text));
}

/**
 * Escape visitor-typed text for HTML + Liquid source: `& < >` become entities, and `{{` /
 * `{%` become literal Liquid outputs so they render as typed instead of executing.
 */
export function escapeText(text: string): string {
  return escapeMarkupText(text).replace(/\{\{|\{%/g, (m) => `{{ '${m}' }}`);
}

/** Inverse of `escapeText`, for reading text back as the visitor typed it. */
export function unescapeText(source: string): string {
  return source
    .replace(/\{\{ '(\{\{|\{%)' \}\}/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function setTextSplices(node: Positioned | Range, text: string, opts: { raw?: boolean } = {}): Splice[] {
  return replaceSplices(node, opts.raw ? text : escapeText(text));
}

/** Set a text node's content. Escaped by default; `{ raw: true }` writes source as given. */
export function setText(source: string, node: Positioned, text: string, opts: { raw?: boolean } = {}): EditResult {
  return done(source, setTextSplices(node, text, opts));
}

type AttrNode = Extract<LiquidHtmlNode, { type: NodeTypes.AttrDoubleQuoted | NodeTypes.AttrSingleQuoted | NodeTypes.AttrUnquoted | NodeTypes.AttrEmpty }>;

/** The static attribute named `name` on an element, if present. */
export function findAttribute(el: ElementNode, name: string): AttrNode | undefined {
  return el.attributes.find(
    (a): a is AttrNode => ATTRIBUTE_TYPES.has(a.type) && segmentsText((a as AttrNode).name) === name,
  );
}

export function setAttributeSplices(source: string, el: ElementNode, name: string, value: string | null): Splice[] {
  if (value !== null && value.includes('"')) throw new EditError(`attribute value for ${name} contains '"'`);
  const existing = findAttribute(el, name);
  if (value === null) {
    if (!existing) return [];
    let start = existing.position.start;
    while (start > 0 && /\s/.test(source[start - 1]!)) start--;
    return [{ from: start, to: existing.position.end, insert: "" }];
  }
  if (existing && existing.type === NodeTypes.AttrDoubleQuoted) {
    const r = existing.attributePosition;
    return [{ from: r.start, to: r.end, insert: value }];
  }
  if (existing) {
    // single-quoted, unquoted or valueless: rewrite the whole attribute as name="value"
    return [{ from: existing.position.start, to: existing.position.end, insert: `${name}="${value}"` }];
  }
  const last = el.attributes.at(-1);
  const at = last
    ? last.position.end
    : typeof el.name === "string"
      ? el.blockStartPosition.start + 1 + el.name.length
      : (el.name as CompoundNameSegment[]).at(-1)!.position.end;
  return [{ from: at, to: at, insert: ` ${name}="${value}"` }];
}

/**
 * Set, add or remove (`value: null`) an attribute. `value` is source text — it may hold
 * `{{ output }}` — and is written inside double quotes, so it must not contain `"`
 * (use single quotes inside Liquid; `&quot;` in text).
 */
export function setAttribute(source: string, el: ElementNode, name: string, value: string | null): EditResult {
  const splices = setAttributeSplices(source, el, name, value);
  return splices.length ? done(source, splices) : { source, touched: [] };
}

/**
 * Wrap splices: the open text goes in before the node, the close after it, and the node's
 * own lines are re-indented in place — so the node's bytes keep their identity (a handle on
 * it follows it into the wrapper).
 */
export function wrapSplices(source: string, node: Positioned, open: string, close: string): Splice[] {
  const { start, end } = node.position;
  if (!(ownsLineStart(source, start) && ownsLineEnd(source, end))) {
    return [
      { from: start, to: start, insert: open },
      { from: end, to: end, insert: close },
    ];
  }
  const indent = indentAt(source, start);
  const body = source.slice(start, end);
  return [
    { from: start, to: start, insert: `${open}\n${indent}${INDENT_UNIT}` },
    ...lineSplices(body, reindent(body, indent, indent + INDENT_UNIT), start),
    { from: end, to: end, insert: `\n${indent}${close}` },
  ];
}

/** Wrap a node in a Liquid block (`{% if x %}` … `{% endif %}`), indenting the node one level when it owns its lines. */
export function wrap(source: string, node: Positioned, open: string, close: string): EditResult {
  return done(source, wrapSplices(source, node, open, close));
}

/** A Liquid tag whose markup has typed named arguments: `for`, `section`, `render`, `paginate`, … */
export type TagWithArguments = Positioned & { name: string; markup: unknown };

export interface TagArgument {
  name: string;
  /** Source text of the value: `"Book now"` (quotes included), `6`, `product.title`. */
  source: string;
  /** Parser value type: `String`, `Number`, `VariableLookup`, `LiquidLiteral`, `Range`. */
  type: string;
  /** Range of the value in the source. */
  range: Range;
}

/** Named arguments of a Liquid tag, in source order (`{% section 'hero', headline: "…" %}`). */
export function readTagArguments(source: string, tag: TagWithArguments): TagArgument[] {
  type Arg = { name?: string; type: string; value?: { type: string; position: Range } };
  // `section` / `render` / `for` markup holds `args`; `form`-like block tags hold the argument list itself.
  const markup = tag.markup as { args?: Arg[] } | Arg[] | null;
  const args = (Array.isArray(markup) ? markup : markup?.args) ?? [];
  return args
    .filter((a) => a.type === NodeTypes.NamedArgument && a.name && a.value)
    .map((a) => ({ name: a.name!, type: a.value!.type, range: { ...a.value!.position }, source: source.slice(a.value!.position.start, a.value!.position.end) }));
}

/**
 * Set a named argument's value (`limit: 6` → `limit: 4`; `headline: "…"` → new text). `value`
 * is source text, so a string keeps its quotes. Only the value's bytes change — this is the
 * one edit a client may make to a section's settings.
 */
export function setTagArgument(source: string, tag: TagWithArguments, argName: string, value: string): EditResult {
  return done(source, setTagArgumentSplices(source, tag, argName, value));
}

/**
 * Splices for `setTagArgument`. With `{ add: true }` a missing argument is appended to the
 * tag's markup (`{% map %}` → `{% map zoom: 4 %}`) instead of throwing.
 */
export function setTagArgumentSplices(source: string, tag: TagWithArguments, argName: string, value: string, opts: { add?: boolean } = {}): Splice[] {
  const arg = readTagArguments(source, tag).find((a) => a.name === argName);
  if (arg) return replaceSplices(arg.range, value);
  if (!opts.add) throw new EditError(`{% ${tag.name} %} has no argument ${argName}`);
  const open = "blockStartPosition" in tag ? (tag as { blockStartPosition: Range }).blockStartPosition : tag.position;
  const text = source.slice(open.start, open.end);
  let at = open.start + text.lastIndexOf("%}");
  while (at > open.start && /[\s-]/.test(source[at - 1]!)) at--;
  const head = source.slice(open.start, at).replace(/^\{%-?\s*/, "");
  const sep = head.trim() === tag.name ? " " : ", ";
  return [{ from: at, to: at, insert: `${sep}${argName}: ${value}` }];
}

/**
 * A Liquid string literal for `value`. Liquid strings have no escape sequences, so this uses
 * double quotes, or single quotes when the value contains `"`; a value with both can't be
 * written as a literal and throws.
 */
export function liquidString(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new EditError("a Liquid string can't contain both ' and \"");
}

/** The six operations, grouped for callers that dispatch by name. */
export const ops = { insert, move, remove, setAttribute, setText, replace } as const;
export type OpName = keyof typeof ops;
