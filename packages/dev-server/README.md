# @pagehub/dev-server

The Node side of running the editor on local folders: a Vite plugin that serves the site endpoints, the folder-as-storage file API, per-site Tailwind builds, self-hosted fonts and a chrome-free page preview. Node only; the browser side is `@pagehub/dev-server/client`.

A **site** is a folder of `.liquid` and `.html` files, plus optional `pages.json`, `site.json`, `data.json`, `icons.json`, `theme.css` and `tailwind.css`. A **sites root** is a folder whose subfolders are sites. Every endpoint takes `?site=<id>`, so tabs on different sites never interfere.

## Install

```bash
pnpm add -D @pagehub/dev-server vite
```

Vite 8 is a peer dependency.

## Use it

Add the plugin to the Vite config of the app that hosts the editor:

```js
// vite.config.mjs
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { editorDevServer } from "@pagehub/dev-server";

export default defineConfig({
  plugins: [react(), editorDevServer({ sitesRoot: "/path/to/sites" })],
});
```

In the app, point the editor at those endpoints with the client helpers:

```tsx
import { useRef } from "react";
import type { Editor as Core } from "@pagehub/engine";
import { Editor } from "@pagehub/editor";
import { httpStorage, devCanvasHost } from "@pagehub/dev-server/client";

const site = new URLSearchParams(location.search).get("site");
const storage = httpStorage({ site });

export function App() {
  const core = useRef<Core | null>(null);
  const canvasHost = devCanvasHost({ site, files: (path) => core.current?.state.files.get(path) });
  return <Editor storage={storage} canvasHost={canvasHost} onReady={(c) => (core.current = c)} />;
}
```

`apps/playground/src/main.tsx` is a complete working version, including the site picker.

## Exports

| Subpath | Exports |
|---|---|
| `.` | `editorDevServer(options)`, the Vite plugin · `createFileApi({ root, engine })`, a `node:http` handler over the engine's `fsStorage` · `renderPreview(engine, { siteDir, reqPath, runtimeSrc, … })` · `renderSitePage(engine, files, page, request)` · `jsonDataSources(engine, data)` · `compileSiteCss(siteDir)` · `localizeFonts(urls, { display, cacheDir, parseFontFaces })` · `localHost(sources, { emptyImage })` · `createSites`, `loadSiteFiles`, `makeRead`, `sitePages` |
| `./client` | `httpStorage({ site })` and `devCanvasHost({ site, files })`, the browser side that talks to the endpoints below |

The server code never imports the engine's TypeScript itself: the caller hands the loaded engine in (`DevEngine`).
The Vite plugin loads it through `server.ssrLoadModule`, so an engine edit takes effect without a restart; the CLI
imports it under `tsx`.

## Endpoints (all through `editorDevServer`)

| URL | What |
|---|---|
| `/api/sites`, `/api/info` | the site picker; the resolved site |
| `/api/files`, `/api/file`, `/api/batch` | the folder as storage (content versions, a stale save answers 409, a batch is all or nothing) |
| `/__site.css` | the site's own Tailwind build (`<site>/tailwind.css`, else Tailwind + DaisyUI), cached until a file in it changes |
| `/__fonts`, `/__fonts/<hash>.woff2` | the theme's Google Fonts, self-hosted |
| `/__runtime.js` | the site runtime as one browser module |
| `/~view/<site>/<route>` | the page as production renders it (`renderPage` + `matchRoute`, `data.json` as data sources), without editor chrome. The runtime is only referenced when the page uses something it handles (`needsRuntime`) |

## Options

```js
editorDevServer({
  dir,          // the folder to open by default
  sitesRoot,    // the folder of switchable sites (default: dir's parent, else <cwd>/sites)
  fontCacheDir, // where downloaded fonts are kept (default: the OS temp dir)
  devKnobs,     // honour ?slow= / ?fail= / SLOW_MS / FAIL, to see loading and error states. Off by default; the CLI never enables it
});
```

Live updates ride Vite's websocket (`site:changed`, `site:reload`); nothing polls.
