/**
 * One parse for HTML and Liquid together. `@shopify/liquid-html-parser` returns a single
 * tree where every node carries `position` (and block nodes `blockStartPosition` /
 * `blockEndPosition`) as offsets into the source string, so the editor can map any node
 * back to the exact bytes that produced it.
 */
import {
  NodeTypes,
  toLiquidHtmlAST,
  walk,
  type CompoundNameSegment,
  type DocumentNode,
  type HtmlElement,
  type HtmlRawNode,
  type HtmlSelfClosingElement,
  type HtmlVoidElement,
  type LiquidBranch,
  type LiquidHtmlNode,
  type LiquidTag,
} from "@shopify/liquid-html-parser";

import type { Environment } from "./environment";

export type ParseMode = "strict" | "tolerant";

export interface ParseOptions {
  /** Parser environment with the site's custom tags registered (see createParserEnvironment). */
  env?: Environment;
}

/** `[start, end)` offsets into the source. */
export interface Range {
  start: number;
  end: number;
}

/** Anything with a source range — every parser node qualifies. */
export interface Positioned {
  position: Range;
}

export type ElementNode = HtmlElement | HtmlVoidElement | HtmlSelfClosingElement | HtmlRawNode;

/** A Liquid tag with an end tag (`for`, `if`, `form`, `paginate`, `capture`, …). */
export type LiquidBlockNode = LiquidTag & {
  children: LiquidHtmlNode[];
  blockStartPosition: Range;
  blockEndPosition: Range;
};

export type { DocumentNode, LiquidHtmlNode, LiquidBranch, CompoundNameSegment };
export { NodeTypes };

/**
 * Parse source into the combined HTML + Liquid tree. Strict mode (the default) throws on
 * Liquid markup it can't type and on any HTML that isn't well-formed — stored source must
 * always parse strict.
 */
export function parseSource(source: string, mode: ParseMode = "strict", opts: ParseOptions = {}): DocumentNode {
  return toLiquidHtmlAST(source, { mode, allowUnclosedDocumentNode: false, environment: opts.env });
}

/** Every node in document order, paired with its parent. */
export function allNodes(ast: LiquidHtmlNode): Array<[LiquidHtmlNode, LiquidHtmlNode | undefined]> {
  const out: Array<[LiquidHtmlNode, LiquidHtmlNode | undefined]> = [];
  walk(ast, (node, parent) => out.push([node, parent]));
  return out;
}

const ELEMENT_TYPES: ReadonlySet<string> = new Set([
  NodeTypes.HtmlElement,
  NodeTypes.HtmlVoidElement,
  NodeTypes.HtmlSelfClosingElement,
  NodeTypes.HtmlRawNode,
]);

export const ATTRIBUTE_TYPES: ReadonlySet<string> = new Set([
  NodeTypes.AttrDoubleQuoted,
  NodeTypes.AttrSingleQuoted,
  NodeTypes.AttrUnquoted,
  NodeTypes.AttrEmpty,
]);

export function isElement(node: LiquidHtmlNode): node is ElementNode {
  return ELEMENT_TYPES.has(node.type);
}

export function isLiquidBlock(node: LiquidHtmlNode): node is LiquidBlockNode {
  return (
    node.type === NodeTypes.LiquidTag &&
    !!(node as LiquidBlockNode).blockEndPosition &&
    Array.isArray((node as LiquidBlockNode).children)
  );
}

/**
 * Tag and attribute names are arrays of TextNode / Liquid parts (`<{{ tag }}>`,
 * `data-{{ k }}`). Joins the static text; Liquid parts read as `{{…}}`. The linter rejects
 * any name that isn't fully static, so in stored source this is always the plain name.
 */
export function segmentsText(name: string | CompoundNameSegment[]): string {
  if (typeof name === "string") return name;
  return name.map((part) => (part.type === NodeTypes.TextNode ? part.value : "{{…}}")).join("");
}

/** The tag name of an element (`div`, `script`, …). */
export function elementName(node: ElementNode): string {
  return segmentsText(node.name as string | CompoundNameSegment[]);
}

/** True for a whitespace-only text node — layout, not content. */
export function isBlankText(node: LiquidHtmlNode): boolean {
  return node.type === NodeTypes.TextNode && !node.value.trim();
}
