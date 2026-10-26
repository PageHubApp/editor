/**
 * A folder of sites. A site is a folder with pages in it (`.liquid` / `.html` / `.css` / `.json`, or a `partials/`
 * dir); its id is the folder name. Everything that reads one lives here: the picker listing, resolving an id to a
 * folder (traversal-safe), the file reader the renderer is given, and the few JSON files a site carries
 * (`site.json`, `data.json`, `icons.json`, `pages.json`).
 */
import { readdir, readFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

export const SITE_EXT = new Set([".html", ".htm", ".liquid", ".css", ".json"]);
export const SKIP = new Set(["node_modules", ".git", "dist", "_site", ".next", ".out"]);

/** Path segments of `file` below `dir` (null when it is `dir` itself or outside it). */
export function within(dir: string, file: string): string[] | null {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/") ? rel.split(sep) : null;
}

/** Is this POSIX path (relative to a site) a site file: a known extension, no dot-dir, no skipped dir? */
export const isSiteFile = (path: string) => SITE_EXT.has(extname(path)) && !path.split("/").some((s) => s.startsWith(".") || SKIP.has(s));

/** `path` resolved inside the site folder `dir`, or null when it escapes or is not a site file. */
export function insideSite(dir: string, path: string): string | null {
  const abs = resolve(dir, path);
  const parts = within(dir, abs);
  return parts && isSiteFile(parts.join("/")) ? abs : null;
}

/** Does a folder directly contain a site file (or a partials/ dir)? A quick "this is a site" test. */
export async function looksLikeSite(dir: string): Promise<boolean> {
  try {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isFile() && SITE_EXT.has(extname(e.name))) return true;
      if (e.isDirectory() && e.name === "partials") return true;
    }
  } catch {
    /* unreadable */
  }
  return false;
}

export interface SiteEntry {
  /** The folder name: the `?site=` key. */
  name: string;
  /** The display name from the site's own `data.json` (else the folder name). */
  label: string;
  path: string;
}

export interface ResolvedSite {
  id: string;
  dir: string;
}

export interface Sites {
  sitesRoot: string;
  /** The folder the server was started on, if any. */
  opened: string | null;
  listSites(): Promise<SiteEntry[]>;
  /** The site an id names inside the sites root, or null (unknown / traversal / not a site). No id: the opened folder, else the first site. */
  resolveSite(id: string | null | undefined): Promise<ResolvedSite | null>;
}

async function siteLabel(path: string, id: string): Promise<string> {
  try {
    const data = JSON.parse(await readFile(resolve(path, "data.json"), "utf8"));
    const name = data?.site?.name || data?.company?.name || data?.site?.title || data?.seo?.title;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    /* no data.json yet, or unreadable: the id */
  }
  return id;
}

/**
 * `dir`: the folder to open by default. `sitesRoot`: the folder whose subfolders are the switchable sites
 * (default: the opened folder's parent, else `<cwd>/sites`).
 */
export function createSites({ dir, sitesRoot: root }: { dir?: string | null; sitesRoot?: string | null } = {}): Sites {
  const opened = dir ? resolve(dir) : null;
  const sitesRoot = resolve(root || (opened ? dirname(opened) : resolve(process.cwd(), "sites")));

  async function listSites(): Promise<SiteEntry[]> {
    const entries = await readdir(sitesRoot, { withFileTypes: true }).catch(() => []);
    const sites: SiteEntry[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const path = resolve(sitesRoot, e.name);
      if (await looksLikeSite(path)) sites.push({ name: e.name, label: await siteLabel(path, e.name), path });
    }
    return sites.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }

  async function resolveSite(id: string | null | undefined): Promise<ResolvedSite | null> {
    if (!id) {
      if (opened) return { id: basename(opened), dir: opened };
      const first = (await listSites())[0];
      return first ? { id: first.name, dir: first.path } : null;
    }
    if (id.startsWith(".") || id.includes("/") || id.includes("\\") || SKIP.has(id)) return null;
    const dir = resolve(sitesRoot, id);
    if (relative(sitesRoot, dir) !== id) return null;
    return (await looksLikeSite(dir)) ? { id, dir } : null;
  }

  return { sitesRoot, opened, listSites, resolveSite };
}

/** A file reader scoped to one site folder (rejects traversal and dot-dirs), for the engine's `files`. */
export function makeRead(siteDir: string): (path: string) => string | undefined {
  return (p) => {
    const abs = resolve(siteDir, p);
    const rel = relative(siteDir, abs);
    if (rel.startsWith("..") || rel.split(sep).some((s) => s.startsWith("."))) return undefined;
    try {
      return readFileSync(abs, "utf8");
    } catch {
      return undefined;
    }
  };
}

export function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export interface SitePage {
  /** The page file. */
  path: string;
  /** The route; `:name` segments are captures. */
  url: string;
  title?: string;
  meta?: Record<string, unknown>;
  policy?: { is404?: boolean; isHome?: boolean };
}

/**
 * The pages of a hosted site's layout, as `pagehub pull` writes it: one page per `pages/<path>.liquid`, the route read
 * from the path the way the server does (`index` is the home page, `[name]` a capture `:name`, `not-found` / `404` the
 * 404 page). A hosted site keeps names, SEO and access rules in page records that are not files, so this is the route
 * only: a custom slug set in the dashboard previews at its file's path.
 */
export function pagesFromFiles(paths: readonly string[]): SitePage[] {
  const pages: SitePage[] = [];
  for (const path of [...paths].sort()) {
    const m = /^pages\/(.+)\.liquid$/.exec(path);
    if (!m) continue;
    const route = m[1]!.replace(/\[([A-Za-z][A-Za-z0-9_]*)\]/g, ":$1");
    const isHome = route === "index";
    pages.push({ path, url: isHome ? "/" : `/${route}`, ...(isHome || route === "not-found" || route === "404" ? { policy: isHome ? { isHome } : { is404: true } } : {}) });
  }
  return pages;
}

/**
 * The site's pages: `pages.json`, else `site.json` `pages`, else (a pulled hosted site) the files under `pages/`
 * (`pagesFromFiles`). `listFiles` lists every file of the site as POSIX paths below it.
 */
export function sitePages(read: (path: string) => string | undefined, listFiles?: () => string[]): SitePage[] {
  const fromPages = parseJson<unknown>(read("pages.json"), null);
  if (Array.isArray(fromPages)) return fromPages as SitePage[];
  const site = parseJson<{ pages?: unknown }>(read("site.json"), {});
  if (Array.isArray(site.pages)) return site.pages as SitePage[];
  return listFiles ? pagesFromFiles(listFiles()) : [];
}

/** POSIX paths of every `.liquid` file under `<siteDir>/pages`. */
function listPageFiles(siteDir: string): string[] {
  const out: string[] = [];
  const visit = (abs: string, rel: string) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) visit(resolve(abs, e.name), `${rel}/${e.name}`);
      else if (e.name.endsWith(".liquid")) out.push(`${rel}/${e.name}`);
    }
  };
  try {
    visit(resolve(siteDir, "pages"), "pages");
  } catch {
    /* no pages/ folder: not a hosted layout */
  }
  return out;
}

/** Everything a site carries besides its pages. */
export interface SiteFiles {
  read: (path: string) => string | undefined;
  site: Record<string, any>;
  data: Record<string, any>;
  icons: Record<string, string>;
  pages: SitePage[];
}

export function loadSiteFiles(siteDir: string): SiteFiles {
  const read = makeRead(siteDir);
  return {
    read,
    site: parseJson(read("site.json"), {}),
    data: parseJson(read("data.json"), {}),
    icons: parseJson(read("icons.json"), {}),
    pages: sitePages(read, () => listPageFiles(siteDir)),
  };
}
