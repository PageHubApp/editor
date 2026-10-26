/**
 * Self-hosted web fonts for a site's theme.
 *
 * A theme's Google Fonts stylesheet costs a cross-origin round trip, and the `woff2` files it names are only
 * discovered (and fetched) after the CSS arrives AND the page has laid out text, so the first paint is in a fallback
 * font and the real one swaps in. `localizeFonts` removes that chain: it downloads the stylesheet and the exact
 * `woff2` files it references ONCE (kept on disk in `cacheDir`), rewrites the `@font-face` rules to same-origin
 * `/__fonts/<hash>.woff2` URLs, and returns the CSS to inline plus the faces to `<link rel="preload">`. Font names,
 * weights and URLs all come from the site's own `theme.css`; nothing is hard-coded here.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DevEngine } from "./engine";

/** Google serves `woff2` (and the per-script `unicode-range` split) only to a modern browser UA. */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const inflight = new Map<string, Promise<LocalizedFonts | null>>();

export interface LocalizedFonts {
  css: string;
  preload: string[];
}

export interface FontOptions {
  /** `optional` = never swap (a face that isn't ready at first paint is skipped for that page and cached for the next); `block` = hold text invisibly for the instant a same-origin face takes to arrive. */
  display?: "optional" | "block";
  /** Where the downloaded files are kept (default: the OS temp dir). */
  cacheDir?: string;
  parseFontFaces: DevEngine["parseFontFaces"];
  /** The URL the server serves the files from (default `/__fonts`). */
  mount?: string;
}

export const defaultFontCacheDir = () => join(tmpdir(), "pagehub-editor", "site-fonts");

/** Is `name` a file this module wrote (`<hash>.woff2`)? Guards the static route against traversal. */
export const isFontFile = (name: string) => /^[0-9a-f]{16}\.woff2$/.test(name);
export const fontFilePath = (cacheDir: string, name: string) => join(cacheDir, name);

async function download(url: string): Promise<Response> {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r;
}

async function build(urls: readonly string[], display: string, cacheDir: string, mount: string, parseFontFaces: FontOptions["parseFontFaces"]): Promise<LocalizedFonts> {
  const blocks: string[] = [];
  const preload: string[] = [];
  await mkdir(cacheDir, { recursive: true });
  for (const u of urls) {
    const css = await (await download(u)).text();
    for (const { css: face, subset, sources } of parseFontFaces(css)) {
      const remote = sources.find((s) => s.url.startsWith("https://fonts.gstatic.com/") && s.url.endsWith(".woff2"))?.url;
      if (!remote) {
        blocks.push(face);
        continue;
      }
      const file = `${sha(remote)}.woff2`;
      const path = fontFilePath(cacheDir, file);
      await readFile(path).catch(async () => writeFile(path, Buffer.from(await (await download(remote)).arrayBuffer())));
      const href = `${mount}/${file}`;
      blocks.push(face.replace(remote, href).replace(/font-display:\s*\w+/, `font-display: ${display}`));
      // The latin face carries the text above the fold; the other scripts load on demand via unicode-range.
      if (subset === "latin") preload.push(href);
    }
  }
  return { css: blocks.join("\n"), preload };
}

/**
 * Same-origin `@font-face` CSS + preload hrefs for these Google Fonts stylesheet URLs, or `null` when they can't be
 * fetched (offline): the caller then falls back to the remote `<link>`s. Cached in memory and on disk.
 */
export function localizeFonts(urls: readonly string[], { display = "optional", cacheDir = defaultFontCacheDir(), parseFontFaces, mount = "/__fonts" }: FontOptions): Promise<LocalizedFonts | null> {
  if (!urls.length) return Promise.resolve(null);
  const key = sha([cacheDir, mount, display, ...urls].join("\n"));
  let p = inflight.get(key);
  if (!p) {
    const cacheFile = join(cacheDir, `${key}.json`);
    p = readFile(cacheFile, "utf8")
      .then((t) => JSON.parse(t) as LocalizedFonts)
      .catch(async () => {
        const out = await build(urls, display, cacheDir, mount, parseFontFaces);
        await writeFile(cacheFile, JSON.stringify(out));
        return out;
      })
      .catch((e: Error) => {
        inflight.delete(key); // retry next request
        console.warn("fonts: could not localize", e && e.message);
        return null;
      });
    inflight.set(key, p);
  }
  return p;
}
