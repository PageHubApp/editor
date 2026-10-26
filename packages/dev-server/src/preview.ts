/**
 * Rendering a site from a folder: the same path production takes (`renderPage` + `matchRoute`, data sources shaped
 * like `defineDataSource` ones), fed by the files a site carries.
 *
 *   `renderSitePage`  one page to its HTML body: what `cli check` scans and what a preview wraps
 *   `renderPreview`   a chrome-free, complete document for one route (the editor's "Open page in a new tab")
 *
 * `data.json` is the site's sample data: every top-level key besides the built-in objects becomes a data source
 * (`jsonDataSources`), `data.site` extends `site.json`, and `data.request.params` are the preview captures a detail
 * page falls back to when the route has none.
 */
import type { DevEngine } from "./engine";
import { localizeFonts } from "./fonts";
import { localHost } from "./localHost";
import { loadSiteFiles, type SiteFiles, type SitePage } from "./sites";

type DataSources = Parameters<DevEngine["renderPage"]>[3]["dataSources"];

/** `data.json` as production-shaped data sources: one per top-level key that is not a built-in object. */
export function jsonDataSources(engine: Pick<DevEngine, "defineDataSource" | "BUILTIN_OBJECTS">, data: Record<string, unknown>): DataSources {
  const builtin: readonly string[] = engine.BUILTIN_OBJECTS;
  return Object.entries(data)
    .filter(([name]) => !builtin.includes(name))
    .map(([name, value]) => engine.defineDataSource({ name, liquid: { global: name }, query: async () => value as never }));
}

/**
 * The sample data a page renders against: `data.json`, with `site.json`'s `company` and `variables` as the data sources
 * of those names (a hosted site keeps them in `site.json`, and the server serves them as `{{ company.* }}` /
 * `{{ variables.* }}`). A `data.json` key of the same name wins.
 */
export const sampleData = (files: SiteFiles): Record<string, unknown> => ({
  ...(files.site.company ? { company: files.site.company } : {}),
  ...(files.site.variables ? { variables: files.site.variables } : {}),
  ...files.data,
});

/** The `site` object a page sees: `site.json`, extended by `data.json`'s `site`, with the page list. */
const siteObject = (files: SiteFiles) => ({ ...files.site, ...(files.data.site ?? {}), pages: files.pages }) as Parameters<DevEngine["renderPage"]>[3]["site"];

/** Render one page of a site to its HTML body (no document around it). Throws what the renderer throws. */
export async function renderSitePage(engine: DevEngine, files: SiteFiles, page: SitePage, request: { path: string; params?: Record<string, string> }): Promise<string> {
  const source = files.read(page.path);
  if (source === undefined) throw new Error(`page file not found: ${page.path}`);
  const renderer = engine.createRenderer({ files: files.read, host: localHost(files, { emptyImage: engine.PLACEHOLDER_IMAGE }) });
  const params = { ...(files.data.request?.params ?? {}), ...request.params };
  const { html } = await engine.renderPage(
    renderer,
    { path: page.path, url: page.url, title: page.title, source, meta: page.meta as never },
    { path: request.path, method: "GET", query: {}, params },
    { dataSources: jsonDataSources(engine, sampleData(files)), site: siteObject(files), mode: "publish" },
  );
  return html;
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface PreviewOptions {
  siteDir: string;
  /** The public route: "/", "/about-us", "/services/3pl-logistics". A miss renders the site's 404 page (`policy.is404`) at 404, or a plain 404. */
  reqPath: string;
  /** Where the site runtime is served from. It is only referenced when the page uses something the runtime handles (`needsRuntime`), as on a published site. */
  runtimeSrc: string;
  /** Raw HTML placed last in `<body>` (the dev server's live-reload hook). */
  bodyExtra?: string;
  siteCssHref?: string;
  /** Internal links are rewritten under this prefix so navigation stays in the preview. */
  viewBase?: string;
  fontCacheDir?: string;
}

export async function renderPreview(engine: DevEngine, { siteDir, reqPath, runtimeSrc, bodyExtra = "", siteCssHref = "/__site.css", viewBase = "/~view", fontCacheDir }: PreviewOptions): Promise<{ status: number; html: string }> {
  const files = loadSiteFiles(siteDir);
  let match = engine.matchRoute(files.pages, reqPath) as { page: SitePage; params: Record<string, string> } | null;
  let status = 200;
  if (!match) {
    const notFound = files.pages.find((p) => p.policy?.is404);
    if (!notFound) return { status: 404, html: "not found" };
    match = { page: notFound, params: {} };
    status = 404;
  }
  if (!match.page.path || files.read(match.page.path) === undefined) return { status: 404, html: "not found" };

  let body = await renderSitePage(engine, files, match.page, { path: reqPath, params: match.params });
  // Keep the site clickable: rewrite root-relative links (`/`, `/contact`, `/#anchor`) to `<viewBase>/…` so navigation
  // stays in the chrome-free render. Protocol-relative, absolute and in-page hrefs are left alone; image `src` stays on its CDN.
  body = body.replace(/(\shref=")(\/(?!\/)[^"]*)"/g, (_m, pre: string, p: string) => `${pre}${viewBase}${p}"`);

  const { css: theme, urls: fontUrls } = engine.splitThemeFonts(files.read("theme.css") || "");
  const rawTitle = match.page.title;
  const title = rawTitle && !String(rawTitle).includes("{{") ? rawTitle : files.site.name || "Preview";
  const fonts = await localizeFonts(fontUrls, { display: "optional", cacheDir: fontCacheDir, parseFontFaces: engine.parseFontFaces });
  // The runtime, only when the page uses it (as production); its config is the site's `runtime` object (cart key, checkout endpoint, chat event).
  const runtime = engine.needsRuntime(body)
    ? (files.site.runtime ? `<script type="application/json" id="runtime-config">${JSON.stringify(files.site.runtime).replace(/</g, "\\u003c")}</script>\n` : "") +
      `<script type="module" src="${escHtml(runtimeSrc)}"></script>\n`
    : "";
  const html =
    `<!doctype html>\n<html lang="${escHtml(files.site.lang || "en")}" data-theme="light">\n<head>\n` +
    `<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `${engine.fontHeadTags(fontUrls, fonts)}\n<title>${escHtml(String(title))}</title>\n<link rel="icon" href="data:,">\n` +
    `<link rel="stylesheet" href="${escHtml(siteCssHref)}">\n` +
    (theme ? `<style id="site-theme">${theme}</style>\n` : "") +
    `</head>\n<body>\n${body}\n${runtime}${bodyExtra}</body>\n</html>\n`;
  return { status, html };
}
