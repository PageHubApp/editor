/**
 * `matchRoute` — which page a request path belongs to.
 *
 * A page's `url` is a route: `/about`, or a pattern with `:name` captures (`/services/:slug`,
 * `/blog/:year/:slug`). An exact `url` wins over any pattern; among patterns the first in `pages`
 * order that fits wins, so list the more specific ones first. A capture matches one non-empty path
 * segment and is URL-decoded. The result's `params` feed `request.params` for `renderPage`.
 *
 * The dev server's preview, `renderPage` callers and a production router all resolve the same way
 * by calling this one function.
 */
export interface RouteMatch<P extends { url?: string }> {
  page: P;
  params: Record<string, string>;
}

/** `/a/b/`, `a/b`, `/a/b?x=1#y` → `/a/b`; the empty path is `/`. */
export function normalizeRoutePath(reqPath: string): string {
  const bare = reqPath.replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "");
  return "/" + bare;
}

const patterns = new Map<string, { rx: RegExp; keys: string[] }>();
function compile(url: string): { rx: RegExp; keys: string[] } {
  let hit = patterns.get(url);
  if (!hit) {
    const keys: string[] = [];
    const rx = new RegExp(
      "^" +
        normalizeRoutePath(url)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/:([A-Za-z0-9_]+)/g, (_m, k: string) => (keys.push(k), "([^/]+)")) +
        "$",
    );
    if (patterns.size > 1000) patterns.clear();
    patterns.set(url, (hit = { rx, keys }));
  }
  return hit;
}

export function matchRoute<P extends { url?: string }>(pages: readonly P[], reqPath: string): RouteMatch<P> | null {
  const path = normalizeRoutePath(reqPath);
  for (const page of pages) if (page.url && normalizeRoutePath(page.url) === path) return { page, params: {} };
  for (const page of pages) {
    if (!page.url || !page.url.includes(":")) continue;
    const { rx, keys } = compile(page.url);
    const m = path.match(rx);
    if (!m) continue;
    try {
      return { page, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) };
    } catch {
      continue; // a malformed escape (`%E0%A4%A`) is no match, not a crash
    }
  }
  return null;
}
