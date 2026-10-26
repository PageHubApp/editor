/**
 * The site-facing half of the dev server, as ONE Vite plugin. Everything the editor app asks the server for lives
 * here; the editor client itself (HMR, Tailwind for its own CSS) is plain Vite.
 *
 * Every site-scoped endpoint takes `?site=<id>` (or `/~view/<site>/…`), so tabs on different sites never interfere:
 * there is no global "open site".
 *
 *   /api/sites, /api/info          the site picker (sites root listing, the resolved site)
 *   /api/files, /api/file, /api/batch   the folder as storage (fileApi.ts)
 *   /__site.css                    a per-site Tailwind build (in-process, cached until a site file changes)
 *   /__fonts, /__fonts/<hash>.woff2   self-hosted web fonts (fonts.ts)
 *   /__runtime.js                  the site runtime as one browser module (site-runtime `bundleInline`)
 *   /~view/<site>/<route>          chrome-free render through the engine (preview.ts)
 *
 * Live updates ride Vite's websocket as custom events (no polling):
 *   site:changed  { site, path }  a file under <sites root>/<id>/ changed on disk: the editor pulls it, previews reload
 *   site:reload  { kind }        site-runtime or engine source changed: previews (and, for the runtime, editor tabs) reload
 */
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { bundleInline } from "@pagehub/site-runtime/bundle";
import type { DevEngine } from "./engine";
import { createFileApi, sendJson } from "./fileApi";
import { defaultFontCacheDir, fontFilePath, isFontFile, localizeFonts } from "./fonts";
import { renderPreview } from "./preview";
import { DEFAULT_SITE_TAILWIND_FILE, compileSiteCss } from "./siteCss";
import { SITE_EXT, SKIP, createSites, within } from "./sites";

export interface EditorDevServerOptions {
  /** The folder to open by default. */
  dir?: string | null;
  /** The folder whose subfolders are the switchable sites (default: the opened folder's parent, else `<cwd>/sites`). */
  sitesRoot?: string | null;
  /** Where downloaded web fonts are kept. */
  fontCacheDir?: string;
  /** Environment for the dev knobs (`SLOW_MS`, `FAIL`). */
  env?: Record<string, string | undefined>;
  /** Honour the dev network knobs (`?slow=` / `?fail=` / `SLOW_MS` / `FAIL`). Off unless asked; only the playground asks. */
  devKnobs?: boolean;
}

/** The URLs this plugin answers; everything else falls through to Vite. */
const MINE = /^\/(api\/|__site\.css$|__fonts(\/|$)|__runtime\.js$|~view(\/|$))/;

/** A /~view tab reloads on `site:reload` and on `site:changed` for its own site (Vite's client, scoped to a custom event). */
const previewReloadHook = (siteId: string) =>
  `<script type="module">import { createHotContext } from "/@vite/client"; const hot = createHotContext("/~view"); ` +
  `hot.on("site:changed", (d) => d.site === ${JSON.stringify(siteId)} && location.reload()); hot.on("site:reload", () => location.reload());</script>\n`;

/** Where a workspace package's entry lives (its `src` under the `source` condition, its `dist` otherwise) and the extension its files carry. */
const entryOf = (pkg: string) => {
  const file = fileURLToPath(import.meta.resolve(pkg));
  return { dir: dirname(file), ext: extname(file) };
};

export function editorDevServer(options: EditorDevServerOptions = {}): Plugin {
  const sites = createSites(options);
  const { sitesRoot, opened } = sites;
  const env = options.env ?? {};
  const fontCacheDir = options.fontCacheDir ?? defaultFontCacheDir();
  const { dir: ENGINE_SRC, ext: ENGINE_EXT } = entryOf("@pagehub/engine");
  const { dir: RUNTIME_SRC, ext: RUNTIME_EXT } = entryOf("@pagehub/site-runtime");

  /** The engine, loaded through Vite SSR: it transforms the TypeScript and drops its cache when a source file changes. */
  const loadEngine = async (server: ViteDevServer): Promise<DevEngine> => {
    const entries = ["render", "canvas", "host", "storage/fs"].map((f) => `${ENGINE_SRC}/${f}${ENGINE_EXT}`).concat(`${RUNTIME_SRC}/index${RUNTIME_EXT}`);
    return Object.assign({}, ...(await Promise.all(entries.map((f) => server.ssrLoadModule(f))))) as DevEngine;
  };

  return {
    name: "pagehub-editor-dev-server",
    // Site files are not part of the editor's module graph: never let Vite treat a change in them as an HMR update.
    handleHotUpdate: ({ file }) => (within(sitesRoot, file) ? [] : undefined),
    async configureServer(server) {
      await mkdir(sitesRoot, { recursive: true }).catch(() => {});
      const { watcher, ws } = server;
      watcher.add([sitesRoot, ENGINE_SRC, RUNTIME_SRC, DEFAULT_SITE_TAILWIND_FILE]);
      const knob = options.devKnobs ? (await import("./devKnobs")).devNetworkKnob : null;
      const engine = () => loadEngine(server);
      const fileApi = createFileApi({ root: async (url) => (await sites.resolveSite(url.searchParams.get("site")))?.dir ?? null, engine });

      // Per-site compiled CSS and the runtime bundle: computed on demand, dropped when their inputs change.
      const siteCss = new Map<string, Promise<string>>();
      let runtime: Promise<string> | null = null;

      let reloadTimer: ReturnType<typeof setTimeout>;
      const queued = new Set<string>();
      const sendSoon = (event: string, data: unknown) => {
        queued.add(JSON.stringify([event, data]));
        clearTimeout(reloadTimer);
        // small debounce: batches a multi-file save and lets Vite invalidate its SSR graph first
        reloadTimer = setTimeout(() => {
          for (const q of queued) {
            const [e, d] = JSON.parse(q);
            ws.send({ type: "custom", event: e, data: d });
          }
          queued.clear();
        }, 60);
      };

      const onFile = (file: string) => {
        if (file === DEFAULT_SITE_TAILWIND_FILE) return void siteCss.clear();
        if (within(RUNTIME_SRC, file)) {
          runtime = null;
          return sendSoon("site:reload", { kind: "runtime" });
        }
        if (within(ENGINE_SRC, file)) return sendSoon("site:reload", { kind: "engine" });
        const parts = within(sitesRoot, file);
        if (!parts || parts.length < 2 || parts.some((s) => s.startsWith(".") || SKIP.has(s)) || !SITE_EXT.has(extname(file))) return;
        siteCss.delete(parts[0]!);
        sendSoon("site:changed", { site: parts[0], path: parts.slice(1).join("/") });
      };
      for (const ev of ["add", "change", "unlink"]) watcher.on(ev, onFile);

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://x");
        const p = url.pathname;
        if (!MINE.test(p)) return next();
        try {
          if (knob && (await knob(url, res, env))) return;
          if (p === "/api/info") {
            const site = await sites.resolveSite(url.searchParams.get("site"));
            return sendJson(res, 200, { dir: site?.dir ?? null, name: site?.id ?? "", root: sitesRoot, sites: await sites.listSites() });
          }
          if (p === "/api/sites") return sendJson(res, 200, { sites: await sites.listSites() });
          if (p === "/__site.css") {
            const site = await sites.resolveSite(url.searchParams.get("site"));
            if (!site) return void res.writeHead(404).end();
            let css = siteCss.get(site.id);
            if (!css) siteCss.set(site.id, (css = compileSiteCss(site.dir)));
            try {
              const text = await css;
              return void res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" }).end(text);
            } catch (e) {
              siteCss.delete(site.id);
              return void res.writeHead(500, { "content-type": "text/css" }).end(`/* site css compile failed: ${String((e as Error)?.message).replace(/\*\//g, "")} */`);
            }
          }
          // Self-hosted web fonts: the woff2 files are content-hashed, so cache them forever.
          if (p.startsWith("/__fonts/")) {
            const name = p.slice("/__fonts/".length);
            if (!isFontFile(name)) return void res.writeHead(404).end();
            try {
              const file = await readFile(fontFilePath(fontCacheDir, name));
              return void res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }).end(file);
            } catch {
              return void res.writeHead(404).end();
            }
          }
          // `/__fonts?u=<google css url>&display=block` -> { css, preload } for the editor canvas (same helper `/~view` uses).
          if (p === "/__fonts") {
            const urls = url.searchParams.getAll("u").filter((u) => u.startsWith("https://fonts.googleapis.com/"));
            const display = url.searchParams.get("display") === "block" ? "block" : "optional";
            const { parseFontFaces } = await engine();
            return sendJson(res, 200, (await localizeFonts(urls, { display, cacheDir: fontCacheDir, parseFontFaces })) ?? { css: "", preload: [], failed: true });
          }
          // The site runtime as one browser module: the editing canvas loads it by URL after each frame write, and `/~view` pages load the same file.
          if (p === "/__runtime.js") {
            try {
              runtime ??= bundleInline();
              const js = await runtime;
              return void res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" }).end(js);
            } catch (e) {
              runtime = null;
              return void res.writeHead(500, { "content-type": "text/plain" }).end(`runtime build failed: ${String((e as Error)?.message)}`);
            }
          }
          // Chrome-free render of a site (the top bar's "Open page in a new tab"): the real engine output, styled by the
          // same `/__site.css` + theme the canvas uses; internal links resolve back under `/~view/<site>/`.
          if (p === "/~view" || p.startsWith("/~view/")) {
            // `/~view/<site>/<route>`: the first segment is the site id when it names a site; otherwise the whole tail is the route on the default site.
            const tail = p.slice("/~view".length).replace(/^\/+/, "");
            const [first, ...rest] = tail.split("/");
            let site = first ? await sites.resolveSite(first) : null;
            const routeTail = site ? rest.join("/") : tail;
            site ??= await sites.resolveSite(null);
            if (!site) return void res.writeHead(404, { "content-type": "text/plain" }).end("no site");
            try {
              const { status, html } = await renderPreview(await engine(), {
                siteDir: site.dir,
                reqPath: "/" + routeTail.replace(/^\/+/, ""),
                runtimeSrc: "/__runtime.js",
                bodyExtra: previewReloadHook(site.id),
                siteCssHref: `/__site.css?site=${encodeURIComponent(site.id)}`,
                viewBase: `/~view/${encodeURIComponent(site.id)}`,
                fontCacheDir,
              });
              return void res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
            } catch (e) {
              if (e instanceof Error) server.ssrFixStacktrace(e);
              return void res.writeHead(500, { "content-type": "text/html; charset=utf-8" }).end(`<pre>render failed: ${String((e as Error)?.message).replace(/[<&]/g, "")}</pre>`);
            }
          }
          if (await fileApi(req, res, url)) return;
          return next();
        } catch (err) {
          if (res.headersSent) res.end();
          else sendJson(res, 500, { error: String((err as Error)?.message) });
        }
      });

      server.httpServer?.once("listening", () => {
        console.log(`  Sites root: ${sitesRoot}\n  Sites are addressed per request: ?site=<id>  (default: ${opened ? basename(opened) : "first site"})`);
      });
    },
  };
}
