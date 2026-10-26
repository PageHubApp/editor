/**
 * Page files as the page selector shows them: the route a file serves and a readable name.
 *
 * Two storage layouts exist. The dev-server folder keeps pages at the root (`index.liquid` → `/`,
 * `blog/index.html` → `/blog`, `about.liquid` → `/about`) with include folders beside them. A hosted
 * site keeps them under `pages/` (`pages/index.liquid` → `/`, `pages/products/[handle].liquid` →
 * `/products/:handle`), with partials and other files outside it. `pagesRoot` tells them apart, and
 * every route / list below is relative to that root.
 *
 * A host that already has page records (`canvasHost.pages`) supplies the route and name itself, so
 * the editor and the renderer agree; the file-derived values are the fallback for a page without one.
 */
import type { Path } from "@pagehub/engine";

const PAGE_FILE = /\.(liquid|html?)$/;
const INCLUDE_DIR = /^(partials|sections|layouts?|snippets|templates)\//;

/** The folder hosted sites keep their pages in. */
export const PAGES_DIR = "pages/";

/** A page the host knows: its file, its route (`:name` segments are captures) and optionally its name. */
export interface PageEntry {
  path: Path;
  url: string;
  name?: string;
}

/** `pages/` when the files use the hosted layout (any page file under it), else `""` (pages at the root). */
export function pagesRoot(files: Iterable<Path>): string {
  for (const p of files) if (p.startsWith(PAGES_DIR) && PAGE_FILE.test(p)) return PAGES_DIR;
  return "";
}

/** The route a page file serves, relative to the pages root: `[handle]` segments are `:handle` captures. */
export function pageRoute(path: Path, root = ""): string {
  const rel = root && path.startsWith(root) ? path.slice(root.length) : path;
  const bare = rel
    .replace(PAGE_FILE, "")
    .replace(/(^|\/)index$/, "")
    .replace(/\[([^\]/]+)\]/g, ":$1");
  return `/${bare}`.replace(/\/$/, "") || "/";
}

export function pageName(path: Path, root = ""): string {
  const route = pageRoute(path, root);
  if (route === "/") return "Home";
  const last = route.slice(route.lastIndexOf("/") + 1).replace(/^:/, "").replace(/[-_]+/g, " ");
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** The page files of a file set (markup under the pages root, or outside include folders), Home first. */
export function listPageFiles(files: Iterable<Path>): Path[] {
  const all = [...files];
  const root = pagesRoot(all);
  const pages = all.filter((p) => PAGE_FILE.test(p) && (root ? p.startsWith(root) : !INCLUDE_DIR.test(p)));
  const home = pages.find((p) => pageRoute(p, root) === "/");
  return home ? [home, ...pages.filter((p) => p !== home)] : pages;
}

/** One page's route and name: the host's record when it has one, else derived from the file. */
export function pageInfo(path: Path, root: string, entries?: readonly PageEntry[]): { route: string; name: string } {
  const entry = entries?.find((e) => e.path === path);
  const route = entry?.url ? (entry.url.startsWith("/") ? entry.url : `/${entry.url}`) : pageRoute(path, root);
  const derived = pageName(path, root);
  return { route, name: route === "/" ? "Home" : entry?.name?.trim() || derived };
}

/** Search appears from this many pages. */
export const PAGE_SEARCH_MIN = 8;
