import fs from "node:fs";
import { parseSource, allNodes, isElement, elementName, findAttribute, type ElementNode, type LiquidHtmlNode, type Range } from "../src/index.ts";

export const SAMPLE = fs.readFileSync(new URL("./fixtures/sample.liquid", import.meta.url), "utf8");

export const nodesOf = (src: string): LiquidHtmlNode[] => allNodes(parseSource(src)).map(([n]) => n);

/** First element matching `pred` in a strict parse of `src`. */
export function findEl(src: string, pred: (el: ElementNode) => boolean): ElementNode {
  const el = nodesOf(src).find((n): n is ElementNode => isElement(n) && pred(n));
  if (!el) throw new Error("element not found");
  return el;
}

export const byTag = (tag: string) => (el: ElementNode) => elementName(el) === tag;

export function attrValue(el: ElementNode, name: string): string | undefined {
  const a = findAttribute(el, name);
  return a && "attributePosition" in a ? a.source.slice(a.attributePosition.start, a.attributePosition.end) : undefined;
}

export const withAttr = (name: string, value: string) => (el: ElementNode) => attrValue(el, name) === value;
export const classHas = (token: string) => (el: ElementNode) => (attrValue(el, "class") ?? "").split(/\s+/).includes(token);

/**
 * The minimal-edit contract: the result parses strict, and every byte of the old source
 * outside the touched ranges appears in the new source, unchanged and in order.
 */
export function assertMinimalEdit(oldSrc: string, newSrc: string, touched: Range[]): void {
  parseSource(newSrc, "strict");
  const sorted = [...touched].sort((a, b) => a.start - b.start);
  const keep: string[] = [];
  let cur = 0;
  for (const r of sorted) {
    keep.push(oldSrc.slice(cur, r.start));
    cur = Math.max(cur, r.end);
  }
  keep.push(oldSrc.slice(cur));
  let pos = 0;
  keep.forEach((seg, i) => {
    const at = newSrc.indexOf(seg, pos);
    if (at === -1 || (i === 0 && at !== 0)) throw new Error(`untouched segment ${i} not preserved: ${JSON.stringify(seg.slice(0, 60))}`);
    pos = at + seg.length;
  });
  if (!newSrc.endsWith(keep.at(-1)!)) throw new Error("file tail changed");
}

/** Lines changed between two sources (prefix/suffix trim). */
export function changedLines(a: string, b: string): { removed: number; added: number } {
  const A = a.split("\n");
  const B = b.split("\n");
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let q = 0;
  while (q < A.length - p && q < B.length - p && A[A.length - 1 - q] === B[B.length - 1 - q]) q++;
  return { removed: A.length - p - q, added: B.length - p - q };
}
