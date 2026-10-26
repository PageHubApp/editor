# @pagehub/site-runtime

The small browser script for published sites. It handles only what native HTML can't: cart actions, autosubmit, autoplay and carousels, scroll animation, analytics beacons, theme toggle, copy, dismiss-and-remember, scrollspy, a page-wide state store, and polyfills for `commandfor` and `closedby`.

A page opts in with `data-*` attributes. The script loads the code for an attribute the first time it appears, and a page that uses none of them needs no script at all.

Not to be confused with the template renderer in `@pagehub/engine`, which runs on the server (or in a worker) and turns Liquid into HTML. This package runs in your visitors' browsers.

## Install

```bash
pnpm add @pagehub/site-runtime
```

## Use it

**1. Decide which pages need it.** `needsRuntime` checks rendered HTML for any attribute the runtime handles:

```ts
import { needsRuntime } from "@pagehub/site-runtime";

if (needsRuntime(html)) {
  // add <script type="module" src="/assets/runtime/<version>/runtime.js"></script>
}
```

**2. Build the files and serve them.** `pnpm --filter @pagehub/site-runtime build` writes to `dist/`:

| File | What |
|---|---|
| `runtime.js` | The core script (about 5 KB). Registers `globalThis.__siteRuntime = { start }`. |
| `chunks/*.js` | One lazy chunk per feature (cart, animate, carousel, map, and so on). |
| `animate.css`, `kit.css` | Styles for `data-animate` and for the `ph-marquee*`, `ph-loop-*` and `ph-mod-*` classes the Tailwind kit emits. |
| `manifest.json` | `{ version, files: [{ path, bytes, sha256 }] }`. `version` is a hash of the contents, so equal builds get equal versions. |

Upload `files` under `<prefix>/<version>/` and set `chunkBase` in the runtime config to that folder.

**3. Configure it** (optional) with a JSON element. See [the attribute reference](../../docs/site-runtime.md#configuration) for every key.

```html
<script type="application/json" id="runtime-config">
  { "cart": { "api": "/api/checkout" }, "chunkBase": "/assets/runtime/1a2b3c/chunks/" }
</script>
<script type="module" src="/assets/runtime/1a2b3c/runtime.js"></script>
```

**Preview and canvas use.** `bundleInline()` (Node only, needs `esbuild`) returns the runtime and every chunk as one self-contained module string, for pages that can't load chunk files:

```ts
import { bundleInline } from "@pagehub/site-runtime/bundle";

const script = await bundleInline({ minify: true });
```

## Attributes

Every attribute is documented, with an example, in the [site runtime attribute reference](../../docs/site-runtime.md). The groups are cart, motion and scroll (`data-animate`, `data-autoplay`, `data-carousel`, `data-scroll-effect`), events and forms, built-in behaviours (`data-copy`, `data-dismiss`, `data-theme-toggle`, `data-autosubmit`), and the page state store (`data-state-*`).

## Entry points

| Import | What |
|---|---|
| `@pagehub/site-runtime` | `start(doc?, config?)` runs the runtime on a document and returns a function that stops it. `readConfig(doc)` reads the JSON config. `needsRuntime(html)` and `RUNTIME_SELECTOR` find the pages and elements that use it. `loadChunk` / `setChunkLoader` control how chunks load. `DISMISS_SNIPPET` and `THEME_SNIPPET` are the inline `<head>` snippets that stop a dismissed banner or a dark theme from flashing. The `CartAdapter` and `TrackAdapter` types are for programmatic adapters. |
| `@pagehub/site-runtime/head/dismiss`, `/head/theme` | Those head snippets on their own. |
| `@pagehub/site-runtime/bundle` | `bundleInline()`, described above. |
| `@pagehub/site-runtime/assets/*` | The built files in `dist/`. |

A host that rewrites a document (an editing canvas, for example) can re-run the script on it with `globalThis.__siteRuntime.start(doc)`.

To add an attribute, add its selector to the chunk that handles it. `needsRuntime` and the selector follow, and a test fails if a selector isn't detected.
