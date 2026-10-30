/**
 * `renderPage` — one page, end to end:
 *
 *   read page + the sections / partials it pulls in
 *   → strip `data-edit-*` (publish mode; `data-editable` too with `stripEditable`; cached)
 *   → find which data sources the sources mention, query those in parallel
 *   → build `site`, `page`, `pages`, `request` (`design_mode` only in editor mode), `routes`
 *   → render → stamp `aria-current="page"` → add head snippets (nonce) the page's attributes need.
 *
 * The renderer is `createRenderer`'s: `overrides` carry the stripped text of the page and of
 * every section / partial it pulls in, replacing `files(path)` for this render only. Nothing here
 * imports liquidjs.
 */
import MagicString from "magic-string";
import { stripEditAttributes, EDITABLE_ATTRIBUTE } from "../attributes/editAttributes";
import { allNodes, isElement, parseSource, segmentsText } from "../parse/parse";
import { repairNesting } from "../parse/repairNesting";
import type { Environment } from "../parse/environment";
import { ATTRIBUTE_TYPES } from "../parse/parse";
import { headSnippets, injectIntoHead, stampAriaCurrent } from "./pageHtml";
import type { Renderer } from "./createRenderer";
import type { JsonValue } from "./tags/schema";
import type { Path } from "../state/changes";
import type { DataSourceDef } from "./defineDataSource";
import { BUILTIN_OBJECTS } from "./objects";
import type { PageMeta } from "./tags/seo";

export type RenderMode = "publish" | "editor";

export interface PageRecord {
  path: Path;
  /** Public URL path of the page (`/about`). */
  url: string;
  title?: string;
  source: string;
  /** Extra values exposed as `page.<key>`. */
  meta?: Record<string, JsonValue>;
}
export interface SiteJson {
  name?: string;
  /** Every page, for the `pages` object. */
  pages?: Array<{ path: Path; url: string; title?: string }>;
  /** Named routes → URL, for the `routes` object. */
  routes?: Record<string, string>;
  [key: string]: JsonValue | undefined | Array<{ path: Path; url: string; title?: string }>;
}
export interface RenderRequest {
  path: string;
  method?: string;
  query?: Record<string, string>;
  /** Captures from the route (`/blog/:slug`). */
  params?: Record<string, string>;
  /** Posted form values (feeds `{% form %}`). */
  form?: Record<string, string>;
}
/** What `renderPage` needs of a renderer: `createRenderer`'s `Renderer` satisfies it. */
export type PageRenderer = Pick<Renderer, "render" | "readFile" | "parserEnvironment">;
export interface RenderPageOptions {
  dataSources: DataSourceDef[];
  site: SiteJson;
  mode?: RenderMode;
  nonce?: string;
  stripEditable?: boolean;
  /** Wall-clock cap for the Liquid render (default: the renderer's own `limits.renderLimit`). */
  timeoutMs?: number;
}
export interface RenderPageResult {
  html: string;
  /** True when a queried data source's rows depend on the visitor: the page must not be edge-cached. */
  visitorDependent: boolean;
  /** Objects the sources mention: built-ins plus the data-source globals. */
  objects: string[];
  /** What the page's `{% seo %}` calls set: the row its stored SEO resolves against, and head fields. */
  pageMeta: PageMeta;
}

const FILE_REF = /\{%-?\s*(section|render)\s+(['"])([A-Za-z0-9_-]+)\2/g;
const MAX_CACHE = 500;

/**
 * Strip `data-edit-*`, and `data-editable` when asked. Memoized per parser environment on the text itself (no hash
 * collisions). Every parse uses the renderer's environment: without it a custom block tag (`{% map %}…{% endmap %}`)
 * isn't a block, and its end tag closes across the HTML around it. Source that doesn't nest properly (a stray `</p>`,
 * an unclosed `<li>`) is repaired first, as a browser would read it: a page renders instead of failing (see
 * `repairNesting`).
 */
const stripCaches = new WeakMap<Environment, Map<string, string>>();
export function stripForPublish(source: string, stripEditable: boolean, env: Environment): string {
  let cache = stripCaches.get(env);
  if (!cache) stripCaches.set(env, (cache = new Map()));
  const key = (stripEditable ? "1" : "0") + source;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const nested = repairNesting(source, env).source;
  let out = stripEditAttributes(nested, { env });
  if (stripEditable && out.includes(EDITABLE_ATTRIBUTE)) out = removeAttribute(out, EDITABLE_ATTRIBUTE, env);
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, out);
  return out;
}

function removeAttribute(source: string, name: string, env: Environment): string {
  const s = new MagicString(source);
  for (const [node] of allNodes(parseSource(source, "strict", { env }))) {
    if (!isElement(node)) continue;
    for (const attr of node.attributes) {
      if (!ATTRIBUTE_TYPES.has(attr.type) || segmentsText((attr as unknown as { name: never }).name) !== name) continue;
      let start = attr.position.start;
      while (start > 0 && /\s/.test(source[start - 1]!)) start--;
      s.remove(start, attr.position.end);
    }
  }
  return s.toString();
}

/** Throws on anything that is not plain JSON (functions, class instances, cycles, NaN): data crossing into the sandbox must clone. */
export function assertPlainJson(value: unknown, where: string, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${where}: non-finite number is not JSON`);
    return;
  }
  if (typeof value !== "object") throw new TypeError(`${where}: ${typeof value} is not JSON`);
  if (seen.has(value)) throw new TypeError(`${where}: circular reference`);
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new TypeError(`${where}: ${proto?.constructor?.name ?? "object"} is not plain JSON`);
  seen.add(value);
  for (const [k, v] of Object.entries(value)) assertPlainJson(v, `${where}.${k}`, seen);
  seen.delete(value);
}

const dev = () => typeof process === "undefined" || process.env?.NODE_ENV !== "production";

/** The page's source plus every `sections/*.liquid` / `partials/*.liquid` it references, transitively. */
export function collectSources(r: Pick<Renderer, "readFile">, page: Pick<PageRecord, "path" | "source">): Map<Path, string> {
  const out = new Map<Path, string>([[page.path, page.source]]);
  const queue = [page.source];
  while (queue.length) {
    for (const m of queue.pop()!.matchAll(FILE_REF)) {
      const path = `${m[1] === "section" ? "sections" : "partials"}/${m[3]}.liquid`;
      if (out.has(path)) continue;
      const text = r.readFile(path);
      if (text === undefined) continue; // the renderer reports the missing file with its own error
      out.set(path, text);
      queue.push(text);
    }
  }
  return out;
}

const mentions = (text: string, name: string) => new RegExp(`(?<![\\w.])${name.replace(/[^\w]/g, "\\$&")}(?!\\w)`).test(text);

export async function renderPage(r: PageRenderer, page: PageRecord, request: RenderRequest, opts: RenderPageOptions): Promise<RenderPageResult> {
  const mode = opts.mode ?? "publish";
  const editor = mode === "editor";
  const sources = collectSources(r, page);
  const overrides: Record<Path, string> = {};
  for (const [path, text] of sources) overrides[path] = editor ? text : stripForPublish(text, opts.stripEditable ?? false, r.parserEnvironment);
  const all = [...sources.values()].join("\n");

  const pageObj: Record<string, JsonValue> = { ...(page.meta ?? {}), path: page.path, url: page.url, title: page.title ?? "" };
  const req: Record<string, JsonValue> = {
    path: request.path,
    method: request.method ?? "GET",
    query: request.query ?? {},
    params: request.params ?? {},
    form: request.form ?? {},
    ...(editor ? { design_mode: true } : {}),
  };
  const data: Record<string, unknown> = {
    site: opts.site,
    page: pageObj,
    pages: opts.site.pages ?? [],
    request: req,
    routes: opts.site.routes ?? Object.fromEntries((opts.site.pages ?? []).map((p) => [p.path, p.url])),
  };

  const queried = opts.dataSources.filter((d) => d.liquid.lazy !== true || mentions(all, d.liquid.global));
  for (const d of queried) {
    if (d.liquid.global in data) throw new Error(`data source "${d.name}" would replace the built-in "${d.liquid.global}" object`);
  }
  const results = await Promise.all(queried.map((d) => d.query({ request, page: pageObj }, { site: opts.site, request, mode })));
  queried.forEach((d, i) => {
    if (dev()) assertPlainJson(results[i], `data source "${d.name}"`);
    data[d.liquid.global] = results[i];
  });
  if (dev()) assertPlainJson(pageObj, "page");

  const pageMeta: PageMeta = { fields: {} };
  let html = await r.render(page.path, data, { mode, overrides, pageMeta, ...(opts.nonce ? { nonce: opts.nonce } : {}), ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }) });
  html = stampAriaCurrent(html, request.path);
  if (!editor) html = injectIntoHead(html, headSnippets(html, opts.nonce));
  return {
    html,
    visitorDependent: queried.some((d) => d.visitorDependent === true),
    objects: [...BUILTIN_OBJECTS.filter((n) => mentions(all, n)), ...queried.map((d) => d.liquid.global)],
    pageMeta,
  };
}
