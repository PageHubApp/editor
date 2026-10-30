/**
 * `formatSource`: lay one HTML + Liquid file out with one block-level element per line and two-space indentation,
 * without changing what it renders. The output differs from the input ONLY in the whitespace between sibling nodes
 * ("gaps"); text, attributes, Liquid and every byte inside a node stay as they are.
 *
 * A gap is rewritten only inside a container whose children are all markup (no text of its own) and whose
 * `white-space` collapses. There, a gap that already holds whitespace becomes a newline and the indentation (any
 * run of collapsible whitespace renders the same), and an EMPTY gap gets a newline only where whitespace provably
 * renders as nothing:
 *
 *   flex / grid / table   next to a child that is a box of its own, or anywhere when every child is one and no
 *                         Liquid output sits among them (whitespace-only text between items is dropped)
 *   block container       next to an in-flow block-level child (whitespace at a line's edge is removed), or anywhere
 *                         when every child is block-level or hidden and nothing can render inline content
 *   inline / unknown      next to an in-flow block-level child only
 *
 * Containers with text (`<p>Hi <b>you</b></p>`), `<pre>`, `<textarea>`, `<script>`, `<style>`, `{% raw %}`,
 * `{% capture %}`, `{% comment %}` and any element whose layout the stylesheets leave open are never touched.
 * Idempotent: a second pass finds every gap it would change already in its final form.
 */
import type { Environment } from "../parse/environment";
import {
  NodeTypes,
  isElement,
  elementName,
  parseSource,
  segmentsText,
  type ElementNode,
  type LiquidBlockNode,
  type LiquidBranch,
  type LiquidHtmlNode,
} from "../parse/parse";
import { applySplices, readTagArguments, type Splice } from "../edit/ops";
import { emptyHints, type LayoutHints } from "./cssHints";
import { isBlockOrNone, isKnownBox, isSolidBlock, isSolidItem, layoutOf, type ElementFacts, type Inner, type Layout } from "./layout";

export interface FormatOptions {
  /** Parser environment with the site's tags registered (`createRenderer(…).parserEnvironment`): `{% map %}` must parse as a block. */
  env: Environment;
  /** What the site's stylesheets do to layout (`scanCss`). Default: nothing beyond Tailwind's utilities. */
  hints?: LayoutHints;
  /** One indentation level. Default two spaces. */
  indent?: string;
}

/** Liquid blocks whose children render in place, once or repeatedly. */
const TRANSPARENT_BLOCKS = new Set(["if", "unless", "case", "for", "paginate"]);
/** Liquid tags that render nothing. `capture` renders into a variable: its body is never touched. */
const SILENT_TAGS = new Set(["assign", "capture", "break", "continue", "#", "comment", "doc", "schema", "javascript", "seo"]);

type Tok =
  | { kind: "el"; start: number; end: number; depth: number; layout: Layout; box: Box | null }
  | { kind: "text" | "out" | "silent" | "delim"; start: number; end: number; depth: number };

/** A node whose children can be laid out: an element, a `{% form %}`, the document. */
interface Box {
  inner: Inner;
  pseudo: boolean;
  children: LiquidHtmlNode[];
  /** Offsets of the content: after the open tag, before the close tag. */
  from: number;
  to: number;
}

const WS = /^[ \t\n\r\f]*$/;

/** The formatted text of one file. Source that doesn't parse strict comes back unchanged. */
export function formatSource(source: string, opts: FormatOptions): string {
  const hints = opts.hints ?? emptyHints();
  if (hints.global) return source;
  let doc;
  try {
    doc = parseSource(source, "strict", { env: opts.env });
  } catch {
    return source;
  }
  const f = new Formatter(source, hints, opts.indent ?? "  ");
  f.box({ inner: "inline", pseudo: false, children: doc.children, from: 0, to: source.length }, "", true);
  return f.splices.length ? applySplices(source, f.splices) : source;
}

/** Static attributes of an element; a value holding Liquid, or Liquid among the attributes, makes it dynamic. */
export function elementFacts(source: string, el: ElementNode): ElementFacts {
  const attrs = new Map<string, string | null>();
  const dynamic = new Set<string>();
  for (const a of el.attributes as LiquidHtmlNode[]) {
    if (a.type === NodeTypes.AttrEmpty) {
      attrs.set(segmentsText((a as any).name).toLowerCase(), null);
      continue;
    }
    if (a.type === NodeTypes.AttrDoubleQuoted || a.type === NodeTypes.AttrSingleQuoted || a.type === NodeTypes.AttrUnquoted) {
      const name = segmentsText((a as any).name).toLowerCase();
      const parts = (a as any).value as LiquidHtmlNode[];
      if (name.includes("{{") || parts.some((p) => p.type !== NodeTypes.TextNode)) dynamic.add(name);
      else attrs.set(name, source.slice((a as any).attributePosition.start, (a as any).attributePosition.end));
      continue;
    }
    // `{% if x %}hidden{% endif %}` among the attributes: any attribute may come and go.
    for (const name of ["class", "style", "hidden", "id"]) dynamic.add(name);
  }
  let tag = "";
  try {
    tag = elementName(el).toLowerCase();
  } catch {
    tag = "";
  }
  if (tag.includes("{{")) tag = "";
  return { tag, attrs, dynamic };
}

class Formatter {
  readonly splices: Splice[] = [];
  constructor(
    private readonly source: string,
    private readonly hints: LayoutHints,
    private readonly unit: string,
  ) {}

  /** Lay out `box`'s children one level below `indent` (the document's children sit AT `indent`). */
  box(box: Box, indent: string, root = false): void {
    if (box.inner === "pre" || box.inner === "none") return;
    const toks: Tok[] = [];
    this.flatten(box.children, 0, toks);
    if (!toks.length || toks.some((t) => t.kind === "text")) return;

    const edges = [box.from, ...toks.flatMap((t) => [t.start, t.end]), box.to];
    const gaps: Array<[number, number]> = [];
    for (let i = 0; i < edges.length; i += 2) gaps.push([edges[i]!, edges[i + 1]!]);
    // A gap that isn't plain whitespace (a node the walk doesn't know): leave the whole container alone.
    if (gaps.some(([a, b]) => b < a || !WS.test(this.source.slice(a, b)))) return;

    const els = toks.filter((t): t is Extract<Tok, { kind: "el" }> => t.kind === "el");
    const noOutput = !toks.some((t) => t.kind === "out");
    const anywhere =
      box.inner === "items"
        ? noOutput && els.every((t) => isKnownBox(t.layout))
        : box.inner === "flow"
          ? noOutput && !box.pseudo && els.every((t) => isBlockOrNone(t.layout))
          : false;
    const solid = (t: Tok | undefined) =>
      t?.kind === "el" && (box.inner === "items" ? isSolidItem(t.layout) : isSolidBlock(t.layout));
    const level = (t: Tok | undefined) => indent + this.unit.repeat(t ? t.depth + (root ? 0 : 1) : 0);

    const placed: boolean[] = [];
    gaps.forEach(([from, to], i) => {
      const left = toks[i - 1];
      const right = toks[i];
      // The document's own edges (file start, file end) are left as they are.
      if (root && (i === 0 || i === toks.length)) {
        placed.push(i === 0 && lineStartAt(this.source, to));
        return;
      }
      const ws = this.source.slice(from, to);
      const brk = ws.length > 0 || anywhere || solid(left) || solid(right);
      placed.push(brk);
      if (!brk) return;
      const text = (ws.split("\n").length > 2 ? "\n\n" : "\n") + level(right);
      if (text !== ws) this.splices.push({ from, to, insert: text });
    });

    toks.forEach((t, i) => {
      if (t.kind === "el" && t.box && placed[i]) this.box(t.box, level(t));
    });
  }

  private flatten(children: readonly LiquidHtmlNode[], depth: number, out: Tok[]): void {
    for (const node of children) {
      const { start, end } = node.position;
      if (isElement(node)) {
        const el = node as ElementNode;
        const layout = layoutOf(elementFacts(this.source, el), this.hints);
        const kids = (el as { children?: LiquidHtmlNode[] }).children;
        const box =
          node.type === NodeTypes.HtmlElement && kids?.length
            ? { inner: layout.inner, pseudo: layout.pseudo, children: kids, from: (el as any).blockStartPosition.end, to: (el as any).blockEndPosition.start }
            : null;
        out.push({ kind: "el", start, end, depth, layout, box });
        continue;
      }
      switch (node.type) {
        case NodeTypes.TextNode:
          if (node.value.trim() || !WS.test(node.value)) out.push({ kind: "text", start, end, depth });
          continue;
        case NodeTypes.HtmlComment:
        case NodeTypes.HtmlDoctype:
          out.push({ kind: "silent", start, end, depth });
          continue;
        case NodeTypes.LiquidRawTag:
          out.push({ kind: SILENT_TAGS.has(node.name) ? "silent" : "out", start, end, depth });
          continue;
        case NodeTypes.LiquidTag:
          this.liquidTag(node as LiquidBlockNode, depth, out);
          continue;
        default:
          // `{{ … }}` and anything else that renders: unknown inline content.
          out.push({ kind: "out", start, end, depth });
      }
    }
  }

  private liquidTag(tag: LiquidBlockNode, depth: number, out: Tok[]): void {
    const { start, end } = tag.position;
    const children = Array.isArray(tag.children) ? tag.children : null;
    if (children && tag.blockEndPosition && TRANSPARENT_BLOCKS.has(tag.name)) {
      out.push({ kind: "delim", start: tag.blockStartPosition.start, end: tag.blockStartPosition.end, depth });
      for (const child of children) {
        if (child.type === NodeTypes.LiquidBranch) {
          const branch = child as LiquidBranch & { blockStartPosition: { start: number; end: number } };
          if (branch.blockStartPosition.end > branch.blockStartPosition.start) {
            out.push({ kind: "delim", start: branch.blockStartPosition.start, end: branch.blockStartPosition.end, depth });
          }
          this.flatten(branch.children, depth + 1, out);
        } else this.flatten([child], depth + 1, out);
      }
      out.push({ kind: "delim", start: tag.blockEndPosition.start, end: tag.blockEndPosition.end, depth });
      return;
    }
    if (tag.name === "form" && children && tag.blockEndPosition) {
      const layout = this.formLayout(tag);
      const box = children.length ? { inner: layout.inner, pseudo: layout.pseudo, children, from: tag.blockStartPosition.end, to: tag.blockEndPosition.start } : null;
      out.push({ kind: "el", start, end, depth, layout, box });
      return;
    }
    if (tag.name === "style") {
      // `{% style %}` renders a `<style>` element: no box.
      out.push({ kind: "el", start, end, depth, layout: layoutOf({ tag: "style", attrs: new Map(), dynamic: new Set() }, this.hints), box: null });
      return;
    }
    out.push({ kind: SILENT_TAGS.has(tag.name) ? "silent" : "out", start, end, depth });
  }

  /** `{% form 'x', class: 'flex gap-2' %}` renders `<form class="flex gap-2">`. */
  private formLayout(tag: LiquidBlockNode): Layout {
    const facts: ElementFacts = { tag: "form", attrs: new Map(), dynamic: new Set() };
    let args;
    try {
      args = readTagArguments(this.source, tag as any);
    } catch {
      args = null;
    }
    const cls = args?.find((a) => a.name === "class");
    if (!args) (facts.dynamic as Set<string>).add("class");
    else if (cls) {
      if (cls.type === "String") (facts.attrs as Map<string, string | null>).set("class", cls.source.slice(1, -1));
      else (facts.dynamic as Set<string>).add("class");
    }
    return layoutOf(facts, this.hints);
  }
}

/** True when only spaces and tabs sit between the line's start and `offset`. */
function lineStartAt(source: string, offset: number): boolean {
  let i = offset - 1;
  while (i >= 0 && (source[i] === " " || source[i] === "\t")) i--;
  return i < 0 || source[i] === "\n";
}
