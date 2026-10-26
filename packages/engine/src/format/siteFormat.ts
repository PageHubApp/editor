/**
 * `formatSiteFiles`: format every markup file of a site (`formatSource`) with what the site's own stylesheets do to
 * layout: `theme.css`, every `<style>` block and `{% style %}` tag in its files, plus the stylesheets the host ships
 * around them (`hostCss`: component CSS such as DaisyUI). A site that links a stylesheet the scanner can't read (any
 * remote CSS but fonts) is left as it is.
 *
 * Whitespace is inherited across files: a partial or section rendered where whitespace may be kept (inside a `<pre>`,
 * an element whose class Liquid writes, a `{% capture %}`, an attribute) is not formatted, nor is anything it renders.
 * Email bodies (`emails/*.liquid`) are not formatted: they render in mail clients, not in the site's stylesheet.
 */
import type { Environment } from "../parse/environment";
import { NodeTypes, isElement, parseSource, type ElementNode, type LiquidHtmlNode } from "../parse/parse";
import { emptyHints, scanCss, type LayoutHints } from "./cssHints";
import { elementFacts, formatSource } from "./format";
import { layoutOf } from "./layout";

export interface FormatSiteOptions {
  env: Environment;
  /** Stylesheets the host renders around the site's own (component CSS). */
  hostCss?: readonly string[];
  indent?: string;
}

const FONT_ONLY_HOSTS = /^(https?:)?\/\/fonts\.(googleapis|bunny)\.(com|net)\//i;
const LIQUID_STYLE_OPEN = /\{%-?\s*style\s*-?%\}/gi;
const LIQUID_STYLE_CLOSE = /\{%-?\s*endstyle\s*-?%\}/gi;

const isMarkupFile = (path: string) => path.endsWith(".liquid") && !path.startsWith("emails/");

/**
 * Every `<tag …>` opening tag of `tag` in `text` (lowercase name), each with the index after its `>`. One pass: the
 * `>` that ends a tag is found with a cursor that only moves forward, so a file of unclosed `<link<link…` stays linear.
 */
function openTags(text: string, lower: string, tag: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const needle = `<${tag}`;
  let gt = -1;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
    if (/[\w-]/.test(text[at + needle.length] ?? "")) continue;
    // Inside the previous tag (`<link <link …>` is one tag): the tags returned never overlap.
    if (at < gt) continue;
    gt = text.indexOf(">", at);
    if (gt < 0) break;
    out.push({ start: at, end: gt + 1 });
  }
  return out;
}

/**
 * The CSS of every `<style>` element and `{% style %}` tag in `text`. Linear: an opener whose closer isn't there ends
 * the scan (no later opener can be closed either), where a lazy `[\s\S]*?` regex rescans the rest of the file from
 * every opener.
 */
function styleBlocks(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (const open of openTags(text, lower, "style")) {
    if (open.start < from) continue;
    const close = lower.indexOf("</style", open.end);
    if (close < 0) break;
    out.push(text.slice(open.end, close));
    from = close;
  }
  LIQUID_STYLE_OPEN.lastIndex = 0;
  for (let m = LIQUID_STYLE_OPEN.exec(text); m; m = LIQUID_STYLE_OPEN.exec(text)) {
    const bodyStart = m.index + m[0].length;
    LIQUID_STYLE_CLOSE.lastIndex = bodyStart;
    const close = LIQUID_STYLE_CLOSE.exec(text);
    if (!close) break;
    out.push(text.slice(bodyStart, close.index));
    LIQUID_STYLE_OPEN.lastIndex = close.index + close[0].length;
  }
  return out;
}

/** What every stylesheet of the site can do to layout. */
export function siteLayoutHints(files: Readonly<Record<string, string>>, hostCss: readonly string[] = []): LayoutHints {
  const hints = emptyHints();
  for (const css of hostCss) scanCss(css, hints);
  if (typeof files["theme.css"] === "string") scanCss(files["theme.css"], hints);
  for (const [path, text] of Object.entries(files)) {
    if (!path.endsWith(".liquid")) continue;
    for (const css of styleBlocks(text)) scanCss(css, hints);
    for (const { start, end } of openTags(text, text.toLowerCase(), "link")) {
      const tag = text.slice(start, end);
      if (!/\brel\s*=\s*["']?[^"'>]*\b(stylesheet|preload)\b/i.test(tag)) continue;
      if (/\brel\s*=\s*["']?preload/i.test(tag) && !/\bas\s*=\s*["']?style/i.test(tag)) continue;
      const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "";
      if (!FONT_ONLY_HOSTS.test(href)) hints.global = true;
    }
  }
  return hints;
}

const CALL = /^\{%-?\s*(render|include|section)\s+(['"])([^'"]+)\2/;

/** `partials/<name>.liquid` / `sections/<name>.liquid` rendered where whitespace may be kept; "*" = any of them. */
export function preRenderedFiles(files: Readonly<Record<string, string>>, env: Environment, hints: LayoutHints): Set<string> {
  const calls = new Map<string, Array<{ target: string; pre: boolean }>>();
  for (const [path, text] of Object.entries(files)) {
    if (!path.endsWith(".liquid")) continue;
    let doc;
    try {
      doc = parseSource(text, "strict", { env });
    } catch {
      continue;
    }
    const found: Array<{ target: string; pre: boolean }> = [];
    // An email renders in a mail client: what it renders keeps its whitespace too.
    walk(doc.children, path.startsWith("emails/"), text, env, hints, found);
    calls.set(path, found);
  }
  const pre = new Set<string>();
  const queue: string[] = [];
  const mark = (target: string) => {
    if (pre.has(target)) return;
    pre.add(target);
    queue.push(target);
  };
  for (const found of calls.values()) for (const c of found) if (c.pre) mark(c.target);
  // Everything a pre-rendered file renders inherits its whitespace.
  while (queue.length) {
    const target = queue.pop()!;
    const paths = target === "*" ? [...calls.keys()].filter((p) => !p.startsWith("pages/")) : [`partials/${target}.liquid`, `sections/${target}.liquid`];
    for (const p of paths) for (const c of calls.get(p) ?? []) mark(c.target);
  }
  return pre;
}

function walk(nodes: readonly LiquidHtmlNode[], pre: boolean, source: string, env: Environment, hints: LayoutHints, out: Array<{ target: string; pre: boolean }>): void {
  for (const node of nodes) {
    let inner = pre;
    if (isElement(node)) {
      const el = node as ElementNode;
      inner = pre || layoutOf(elementFacts(source, el), hints).pre;
      // A call written into an attribute value renders into it.
      for (const a of el.attributes as LiquidHtmlNode[]) walk([a], true, source, env, hints, out);
    }
    if (node.type === NodeTypes.LiquidTag) {
      const text = source.slice(node.position.start, node.position.end);
      const call = CALL.exec(text);
      if (call) out.push({ target: call[3]!, pre });
      else if (/^\{%-?\s*(render|include|section)\b/.test(text)) out.push({ target: "*", pre });
      // `{% liquid render 'x' %}`: its statements aren't tags of their own.
      else if (node.name === "liquid" && /\b(render|include|section)\b/.test(text)) out.push({ target: "*", pre });
      if (node.name === "capture") inner = true;
    }
    if (node.type === NodeTypes.LiquidRawTag) continue;
    for (const key of ["children", "value"] as const) {
      const kids = (node as any)[key];
      if (Array.isArray(kids)) walk(kids, inner, source, env, hints, out);
    }
    const markup = (node as any).markup;
    if (Array.isArray(markup)) walk(markup.filter((m: any) => m && typeof m.type === "string"), inner, source, env, hints, out);
  }
}

/** Every markup file formatted; other files, and files that can't be formatted safely, come back as they are. */
export function formatSiteFiles(files: Readonly<Record<string, string>>, opts: FormatSiteOptions): Record<string, string> {
  const hints = siteLayoutHints(files, opts.hostCss);
  const out: Record<string, string> = { ...files };
  if (hints.global) return out;
  const pre = preRenderedFiles(files, opts.env, hints);
  for (const [path, text] of Object.entries(files)) {
    if (!isMarkupFile(path)) continue;
    const name = /^(partials|sections)\/(.+)\.liquid$/.exec(path)?.[2];
    if (name && (pre.has(name) || pre.has("*"))) continue;
    out[path] = formatSource(text, { env: opts.env, hints, indent: opts.indent });
  }
  return out;
}
