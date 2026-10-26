/**
 * A TipTap JSON document → a rich-text leaf's inner source. Text is escaped for HTML + Liquid
 * (`{{` becomes `{{ '{{' }}`), chips and raw atoms write their bytes back unchanged, and marks
 * write their original open tag when they still have one (`src`), else a canonical tag.
 */
import { escapeText } from "@pagehub/engine";
import { MARK_TAGS, NODE, type SimpleMark } from "./schema";
import type { JsonMark, JsonNode } from "./toDoc";

const attrText = (v: string) => v.replace(/&(?![#a-z0-9]+;)/gi, "&amp;").replace(/"/g, "&quot;");

const attrs = (pairs: Record<string, unknown>) =>
  Object.entries(pairs)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => ` ${k}="${attrText(String(v))}"`)
    .join("");

function tagOf(m: JsonMark): string {
  const a = m.attrs ?? {};
  if (typeof a.tag === "string" && a.tag) return a.tag;
  if (m.type in MARK_TAGS) return MARK_TAGS[m.type as SimpleMark].tag;
  return m.type === "link" ? "a" : "span";
}

function openTag(m: JsonMark): string {
  const a = m.attrs ?? {};
  if (typeof a.src === "string" && a.src) return a.src;
  const tag = tagOf(m);
  if (m.type === "link") return `<a${attrs({ href: a.href, target: a.target, rel: a.rel ?? (a.target === "_blank" ? "noopener" : null) })}>`;
  if (m.type === "textColor") return `<span class="text-${a.token}">`;
  if (m.type === "highlight") return `<span class="bg-${a.token}">`;
  return `<${tag}>`;
}

const sameMark = (a: JsonMark, b: JsonMark) => a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});

/** Escape typed text for the source; a non-breaking space stays visible as `&nbsp;`. */
const textSource = (text: string): string => escapeText(text).replace(/ /g, "&nbsp;");

/** Inner source for a document. */
export function docToSource(doc: JsonNode): string {
  let out = "";
  const open: JsonMark[] = [];
  const closeTo = (n: number) => {
    while (open.length > n) out += `</${tagOf(open.pop()!)}>`;
  };
  for (const node of doc.content ?? []) {
    const marks = node.marks ?? [];
    let keep = 0;
    while (keep < open.length && keep < marks.length && sameMark(open[keep]!, marks[keep]!)) keep++;
    closeTo(keep);
    for (const m of marks.slice(keep)) {
      out += openTag(m);
      open.push(m);
    }
    if (node.type === "text") out += textSource(node.text ?? "");
    else if (node.type === NODE.br) out += "<br>";
    else out += String(node.attrs?.source ?? "");
  }
  closeTo(0);
  return out;
}
