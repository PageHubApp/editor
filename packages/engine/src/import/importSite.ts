/**
 * Site-level import: `importHtml` per page, then `liftPartials` across pages.
 *
 * `liftPartials` finds a top-level `<header>` / `<footer>` (child of `<body>`, or of the document in
 * a fragment) and a `<nav>` under `<body>`, identical (whitespace-collapsed) on at least `min` pages,
 * and moves it to `partials/<tag>.liquid`, leaving `{% render '<tag>' %}`. A page whose copy differs
 * keeps its own.
 */
import type { Environment } from "../parse/environment";
import { allNodes, elementName, isElement, parseSource, type ElementNode } from "../parse/parse";
import { importHtml, type ImportReport } from "./importHtml";

const LIFTABLE = new Set(["header", "footer", "nav"]);
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

interface Found {
  tag: string;
  start: number;
  end: number;
  text: string;
}

function topLevel(source: string, env?: Environment): Found[] {
  const ast = parseSource(source, "strict", { env });
  const out: Found[] = [];
  for (const [node, parent] of allNodes(ast)) {
    if (!isElement(node)) continue;
    const tag = elementName(node);
    if (typeof tag !== "string" || !LIFTABLE.has(tag)) continue;
    const parentTag = parent && isElement(parent) ? elementName(parent) : undefined;
    const top = parentTag === "body" || (parent === ast && !/<body[\s>]/i.test(source));
    if (!top || (tag === "nav" && parentTag !== "body")) continue;
    out.push({ tag, start: (node as ElementNode).position.start, end: (node as ElementNode).position.end, text: source.slice((node as ElementNode).position.start, (node as ElementNode).position.end) });
  }
  return out;
}

export function liftPartials(
  pages: Record<string, string>,
  opts: { min?: number; env?: Environment } = {},
): { pages: Record<string, string>; partials: Record<string, string> } {
  const min = opts.min ?? 2;
  const found = new Map<string, Found[]>();
  for (const [path, src] of Object.entries(pages)) found.set(path, topLevel(src, opts.env));

  // fingerprint -> pages that carry it
  const groups = new Map<string, { tag: string; text: string; pages: Set<string> }>();
  for (const [path, list] of found) {
    for (const f of list) {
      const key = `${f.tag}\u0000${collapse(f.text)}`;
      const g = groups.get(key) ?? { tag: f.tag, text: f.text, pages: new Set() };
      g.pages.add(path);
      groups.set(key, g);
    }
  }

  const names = new Map<string, string>(); // fingerprint -> partial name
  const partials: Record<string, string> = {};
  const perTag = new Map<string, number>();
  const ranked = [...groups.entries()].filter(([, g]) => g.pages.size >= min).sort((a, b) => b[1].pages.size - a[1].pages.size);
  for (const [key, g] of ranked) {
    const n = (perTag.get(g.tag) ?? 0) + 1;
    perTag.set(g.tag, n);
    const name = n === 1 ? g.tag : `${g.tag}-${n}`;
    names.set(key, name);
    partials[`partials/${name}.liquid`] = g.text + "\n";
  }

  const out: Record<string, string> = {};
  for (const [path, src] of Object.entries(pages)) {
    let text = src;
    const list = (found.get(path) ?? []).filter((f) => names.has(`${f.tag}\u0000${collapse(f.text)}`)).sort((a, b) => b.start - a.start);
    for (const f of list) text = text.slice(0, f.start) + `{% render '${names.get(`${f.tag}\u0000${collapse(f.text)}`)}' %}` + text.slice(f.end);
    out[path] = text;
  }
  return { pages: out, partials };
}

export interface ImportSiteReport {
  /** Per imported page, by output path. */
  pages: Record<string, ImportReport>;
  /** Lifted partials: path → pages that now render it. */
  lifted: Record<string, string[]>;
  /** Files copied untouched (css, images …). */
  passthrough: string[];
}

const HTML = /\.html?$/i;

/** `index.html` → `pages/index.liquid`; a path already under `pages/` keeps its prefix. */
export function pagePath(path: string): string {
  const p = path.replace(/^\.?\//, "").replace(HTML, ".liquid");
  return p.startsWith("pages/") ? p : `pages/${p}`;
}

export function importSite(
  files: Record<string, string>,
  opts: { env?: Environment; min?: number; sanitize?: boolean } = {},
): { files: Record<string, string>; report: ImportSiteReport } {
  const report: ImportSiteReport = { pages: {}, lifted: {}, passthrough: [] };
  const pages: Record<string, string> = {};
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    if (HTML.test(path)) {
      const r = importHtml(text, opts);
      const target = pagePath(path);
      pages[target] = r.source;
      report.pages[target] = r.report;
    } else {
      out[path] = text;
      report.passthrough.push(path);
    }
  }
  const lifted = liftPartials(pages, opts);
  for (const [path, text] of Object.entries(lifted.partials)) {
    const name = path.slice("partials/".length, -".liquid".length);
    report.lifted[path] = Object.keys(lifted.pages).filter((p) => lifted.pages[p]!.includes(`{% render '${name}' %}`));
    out[path] = text;
  }
  Object.assign(out, lifted.pages);
  return { files: out, report };
}
