/**
 * Rich-text leaves: elements whose children are text, `{{ output }}`s and inline elements
 * (no Liquid tags, no block elements). Their inner source is real inline HTML; the rich-text
 * editor rewrites it through `text.setInner`, which sanitizes to an inline allowlist and
 * splices only the bytes that differ. Typing commits one `text.setInner` per group, and every
 * commit carries the element's handle as its history group, so a burst of typing is one undo step.
 */
import { defineCommand } from "../../commands/defineCommand";
import { escapeText, applySplices, type Splice } from "../../edit/ops";
import { parseSource, NodeTypes } from "../../parse/parse";
import { buildTree, type ElementTreeNode, type TreeNode } from "../../parse/tree";
import { parserTagsFacet } from "../../extensions/facets";
import { t } from "../../schema/t";
import type { NodeHandle } from "../../state/handles";
import type { Environment } from "../../parse/environment";
import { iconFilterOf, isIconImage } from "./iconFilter";

/** Inline elements a rich-text leaf may hold. */
export const INLINE_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "img", "ins", "kbd",
  "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);

/** Elements that are text leaves even while empty. */
export const TEXT_LEAF_TAGS: ReadonlySet<string> = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "a", "button", "label", "li", "td", "th", "dt", "dd",
  "figcaption", "blockquote", "small", "strong", "em", "b", "i", "u", "caption", "legend", "summary", "cite", "q",
]);

/** Never rich text, whatever they hold. */
const NEVER: ReadonlySet<string> = new Set(["script", "style", "textarea", "template", "svg", "select", "option", "title", "pre", "noscript", "iframe"]);

const GLOBAL_ATTRS: ReadonlySet<string> = new Set(["class", "id", "lang", "dir", "title", "role", "data-edit-id"]);
const TAG_ATTRS: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading"],
  abbr: ["title"],
  time: ["datetime"],
  data: ["value"],
  q: ["cite"],
  del: ["cite", "datetime"],
  ins: ["cite", "datetime"],
};
const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "cite"]);
const UNSAFE_URL = /^\s*(javascript|vbscript|data):/i;

const contentOk = (c: TreeNode): boolean => c.kind === "content" && (c.type === NodeTypes.TextNode || c.type === NodeTypes.LiquidVariableOutput);

function inlineOk(children: readonly TreeNode[]): boolean {
  return children.every((c) =>
    c.kind === "element"
      ? INLINE_TAGS.has(c.tag) && !c.attributes.some((a) => a.liquid) && inlineOk(c.children)
      : contentOk(c),
  );
}

/** True when `node` is a rich-text leaf. */
export function isRichTextNode(node: TreeNode): node is ElementTreeNode {
  if (node.kind !== "element" || !node.closeTag || NEVER.has(node.tag) || node.attributes.some((a) => a.liquid)) return false;
  if (!inlineOk(node.children)) return false;
  // An Icon renders as an SVG, not text: editing it as text would show its `{{ … | icon }}` source in the canvas.
  if (iconFilterOf(node) || isIconImage(node)) return false;
  return TEXT_LEAF_TAGS.has(node.tag) || node.children.some((c) => c.kind === "content");
}

/** True when the handle is a live element whose inner source the rich-text editor may own. */
export function isRichTextLeaf(h: NodeHandle | null | undefined): h is NodeHandle {
  return !!h?.alive && h.kind === "element" && isRichTextNode(h.node());
}

/** The inner range of a rich-text leaf (between its open and close tags). */
export function innerRange(node: ElementTreeNode): { from: number; to: number } {
  return { from: node.openTag.end, to: node.closeTag!.start };
}

/**
 * Sanitize inline HTML to the allowlist: disallowed elements are unwrapped (their children
 * kept), disallowed or unsafe attributes dropped, Liquid tags removed. Source that doesn't
 * parse is written as escaped text.
 */
export function sanitizeInline(source: string, env?: Environment): string {
  let tree: TreeNode[];
  try {
    tree = buildTree(parseSource(source, "strict", { env }));
  } catch {
    return escapeText(source);
  }
  const splices: Splice[] = [];
  const visit = (nodes: readonly TreeNode[]) => {
    for (const n of nodes) {
      if (n.kind === "liquid-block") {
        splices.push({ from: n.openTag.start, to: n.openTag.end, insert: "" }, { from: n.closeTag.start, to: n.closeTag.end, insert: "" });
        for (const b of n.branches) visit(b.children);
        continue;
      }
      if (n.kind === "content") {
        if (n.type !== NodeTypes.TextNode && n.type !== NodeTypes.LiquidVariableOutput) splices.push({ from: n.range.start, to: n.range.end, insert: "" });
        continue;
      }
      if (!INLINE_TAGS.has(n.tag)) {
        splices.push({ from: n.openTag.start, to: n.openTag.end, insert: "" });
        if (n.closeTag) splices.push({ from: n.closeTag.start, to: n.closeTag.end, insert: "" });
        if (!NEVER.has(n.tag)) visit(n.children);
        else if (n.closeTag) splices.push({ from: n.openTag.end, to: n.closeTag.start, insert: "" });
        continue;
      }
      const allowed = TAG_ATTRS[n.tag] ?? [];
      for (const a of n.attributes) {
        const name = a.name.toLowerCase();
        const value = source.slice(a.range.start, a.range.end).replace(/^[^=]*=\s*["']?|["']$/g, "");
        const ok = !a.liquid && (GLOBAL_ATTRS.has(name) || name.startsWith("aria-") || allowed.includes(name)) && !(URL_ATTRS.has(name) && UNSAFE_URL.test(value));
        if (!ok) {
          let from = a.range.start;
          while (from > n.openTag.start && /\s/.test(source[from - 1]!)) from--;
          splices.push({ from, to: a.range.end, insert: "" });
        }
      }
      visit(n.children);
    }
  };
  visit(tree);
  return applySplices(source, splices);
}

/** Splice turning `from` into `to`, trimmed to the bytes that differ (null when equal). */
export function diffSplice(before: string, after: string, base = 0): Splice | null {
  if (before === after) return null;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  return { from: base + p, to: base + before.length - q, insert: after.slice(p, after.length - q) };
}

export interface SetInnerArgs {
  /** The leaf (default: the primary selection). */
  target?: NodeHandle;
  /** New inner source, without the leaf's leading / trailing whitespace. */
  source: string;
}

/**
 * Replace a rich-text leaf's inner source. The leaf's own leading / trailing whitespace
 * (its indentation) is kept; the new source is sanitized, and only the differing bytes change.
 */
export const textSetInner = defineCommand<SetInnerArgs>({
  id: "text.setInner",
  title: "Edit text",
  args: t.object({ target: t.handle<NodeHandle>().optional(), source: t.string() }),
  run({ state, selection, tr, dispatch }, { target, source }) {
    const h = target ?? selection.primary;
    if (!isRichTextLeaf(h)) return false;
    const node = h.node() as ElementTreeNode;
    const { from, to } = innerRange(node);
    const text = state.files.get(h.path)!;
    const current = text.slice(from, to);
    const lead = /^\s*/.exec(current)![0];
    const trail = current.length > lead.length ? /\s*$/.exec(current)![0] : "";
    const next = lead + sanitizeInline(source, state.facet(parserTagsFacet)) + trail;
    const sp = diffSplice(current, next, from);
    if (!sp) return false;
    if (dispatch) dispatch(tr.replace({ path: h.path, from: sp.from, to: sp.to }, sp.insert).annotate({ group: h }));
    return true;
  },
});

/** Tags a text leaf can switch between (the Font panel's Normal / H1–H4). */
export const TEXT_BLOCK_TAGS = ["p", "h1", "h2", "h3", "h4"] as const;

/** Switch a text leaf between paragraph and heading levels (open and close tag). */
export const textSetTag = defineCommand<{ target?: NodeHandle; tag: (typeof TEXT_BLOCK_TAGS)[number] }>({
  id: "text.setTag",
  title: "Text level",
  args: t.object({ target: t.handle<NodeHandle>().optional(), tag: t.enum(TEXT_BLOCK_TAGS) }),
  run({ selection, tr, dispatch }, { target, tag }) {
    const h = target ?? selection.primary;
    if (!isRichTextLeaf(h) || !(TEXT_BLOCK_TAGS as readonly string[]).includes(h.tag) || h.tag === tag) return false;
    if (dispatch) dispatch(tr.setTagName(h, tag));
    return true;
  },
});

/** The rich-text engine pieces as one extension. */
export const inlineText = () => [textSetInner, textSetTag];
