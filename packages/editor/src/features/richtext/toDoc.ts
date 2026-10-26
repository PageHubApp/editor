/**
 * A rich-text leaf's inner source → a TipTap JSON document. Built from the engine's parse
 * tree (not the DOM), so every mark keeps its element's exact open tag and every `{{ output }}`
 * keeps its exact bytes. Whitespace collapses the way HTML renders it; the leaf's own leading
 * and trailing whitespace stays in the source (`text.setInner` keeps it).
 */
import { NodeTypes, unescapeText, type ElementTreeNode, type TreeNode } from "@pagehub/engine";
import { MARK_TAGS, NODE, classOfSrc, type SimpleMark } from "./schema";

export interface JsonMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface JsonNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: JsonMark[];
  content?: JsonNode[];
}

const LITERAL_OUTPUT = /^\{\{ '(\{\{|\{%)' \}\}$/;
const TOKEN_CLASS = /^(text|bg)-(primary|secondary|accent|neutral|base-content|info|success|warning|error)$/;
const SIMPLE = new Map<string, SimpleMark>(
  (Object.entries(MARK_TAGS) as [SimpleMark, (typeof MARK_TAGS)[SimpleMark]][]).flatMap(([name, spec]) => spec.tags.map((t) => [t, name] as const)),
);

/** Decode HTML entities in text (`&amp;` … and named ones through the DOM when present). */
function decodeText(raw: string): string {
  const s = unescapeText(raw);
  if (!/&[#a-z0-9]+;/i.test(s) || typeof document === "undefined") return s;
  const ta = document.createElement("textarea");
  ta.innerHTML = s.replace(/</g, "&lt;");
  return ta.value;
}

const attrValue = (src: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(src);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
};

/** The mark an inline element becomes. */
function markOf(el: ElementTreeNode, src: string): JsonMark {
  const simple = SIMPLE.get(el.tag);
  if (simple) return { type: simple, attrs: { tag: el.tag, src } };
  if (el.tag === "a") return { type: "link", attrs: { tag: "a", src, href: attrValue(src, "href"), target: attrValue(src, "target"), rel: attrValue(src, "rel") } };
  const token = el.tag === "span" && el.attributes.length === 1 ? TOKEN_CLASS.exec(classOfSrc(src) ?? "") : null;
  if (token) return { type: token[1] === "text" ? "textColor" : "highlight", attrs: { tag: "span", src, token: token[2] } };
  return { type: "inlineEl", attrs: { tag: el.tag, src } };
}

/** TipTap JSON for the leaf's inner source. */
export function leafToDoc(source: string, leaf: ElementTreeNode): JsonNode {
  const out: JsonNode[] = [];
  const text = (raw: string, marks: JsonMark[]) => {
    const value = decodeText(raw).replace(/[ \t\r\n\f]+/g, " ");
    if (!value) return;
    const last = out.at(-1);
    if (last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text = (last.text + value).replace(/ {2,}/g, " ");
    else out.push({ type: "text", text: value, ...(marks.length ? { marks } : {}) });
  };
  const walk = (children: readonly TreeNode[], from: number, to: number, marks: JsonMark[]) => {
    let pos = from;
    for (const c of children) {
      text(source.slice(pos, c.range.start), marks);
      const raw = source.slice(c.range.start, c.range.end);
      if (c.kind === "content" && c.type === NodeTypes.LiquidVariableOutput) {
        const literal = LITERAL_OUTPUT.exec(raw);
        if (literal) text(literal[1]!, marks);
        else out.push({ type: NODE.output, attrs: { source: raw }, ...(marks.length ? { marks } : {}) });
      } else if (c.kind === "content") {
        text(raw, marks);
      } else if (c.kind === "element" && c.tag === "br") {
        out.push({ type: NODE.br });
      } else if (c.kind === "element" && c.closeTag) {
        walk(c.children, c.openTag.end, c.closeTag.start, [...marks, markOf(c, source.slice(c.openTag.start, c.openTag.end))]);
      } else {
        out.push({ type: NODE.raw, attrs: { source: raw }, ...(marks.length ? { marks } : {}) });
      }
      pos = c.range.end;
    }
    text(source.slice(pos, to), marks);
  };
  walk(leaf.children, leaf.openTag.end, leaf.closeTag!.start, []);
  // the leaf's own leading / trailing whitespace isn't content
  const first = out[0];
  if (first?.type === "text") first.text = first.text!.replace(/^ /, "");
  const last = out.at(-1);
  if (last?.type === "text") last.text = last.text!.replace(/ $/, "");
  return { type: "doc", content: out.filter((n) => n.type !== "text" || n.text) };
}
