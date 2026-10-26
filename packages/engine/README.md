# @pagehub/engine

The headless core of the editor. It parses HTML and Liquid source, applies edits as minimal splices, lints, and renders pages. There's no UI and no DOM; it runs in Node, a browser or a worker.

## Install

```bash
pnpm add @pagehub/engine
```

## Quick tour

**Edit without rewriting the file.** Every edit returns the new source, and every byte outside the edit is unchanged:

```ts
import { parseSource, allNodes, isElement, elementName, setAttribute, lint } from "@pagehub/engine";

const src = `<main>\n  <a href="/old" class="btn">Go</a>\n</main>\n`;
const link = allNodes(parseSource(src)).map(([node]) => node).filter(isElement).find((n) => elementName(n) === "a")!;

const { source } = setAttribute(src, link, "href", "/new");
// <main>\n  <a href="/new" class="btn">Go</a>\n</main>\n

lint(src); // [] : nothing that would break a clean editor tree
```

**Render a page like production.** `matchRoute` finds the page for a URL, and `renderPage` renders it with your data sources:

```ts
import { createRenderer, renderPage, matchRoute, defineDataSource } from "@pagehub/engine/render";

const products = defineDataSource({ name: "products", liquid: { global: "products" }, query: async () => [{ name: "Fern" }] });

const files: Record<string, string> = {
  "pages/shop.liquid": `<h1>{{ page.title }}</h1>{% for p in products %}<p>{{ p.name }}</p>{% endfor %}`,
};
const renderer = createRenderer({ files: (path) => files[path], extensions: [products] });
const pages = [{ path: "pages/shop.liquid", url: "/shop/:slug", title: "Shop", source: files["pages/shop.liquid"]! }];

const match = matchRoute(pages, "/shop/fern"); // { page, params: { slug: "fern" } } or null
if (match) {
  const { html } = await renderPage(renderer, match.page, { path: "/shop/fern", params: match.params }, { dataSources: [products], site: { name: "Demo" } });
}
```

**Open an editing session over storage.** `createEditor` reads every file from a storage adapter and tracks changes until you save:

```ts
import { createEditor, memoryStorage } from "@pagehub/engine";

const editor = await createEditor({ storage: memoryStorage({ "index.html": "<h1>Hi</h1>\n" }) });
await editor.save(); // writes only files that changed; a stale file comes back as a conflict, not an overwrite
```

## Entry points

| Import | What |
|---|---|
| `@pagehub/engine` | Parse (`parseSource`, `buildTree`, `pathAtOffset`), edit operations, `lint`, editor attributes, state and history, `defineElement` / `defineCommand` / `defineRule`, storage (`defineStorage`, `memoryStorage`, `StorageError`), `importHtml`, `createEditor` |
| `@pagehub/engine/render` | `createRenderer`, `renderPage`, `matchRoute`, `pageReads`, `classesInMarkup`, `defineTag` / `defineFilter` / `defineDataSource`, the built-in tags and filters, `ENGINE_VERSION` |
| `@pagehub/engine/kits` | `htmlKit`, `liquidKit`, `tailwindKit` and their commands, models and drag-and-drop planning |
| `@pagehub/engine/host` | Catalogues a host plugs in: media, icons, fonts, theme colors, blocks, theme presets, font pairings |
| `@pagehub/engine/canvas` | Source-mapped canvas rendering and the font head tags (`parseFontFaces`, `fontHeadTags`) |
| `@pagehub/engine/fs` | `fsStorage`, folder-backed storage (Node only) |
| `@pagehub/engine/worker` | A worker entry (Web Worker or `node:worker_threads`) that hosts a renderer, plus its client `createWorkerRenderer` |
| `@pagehub/engine/testing` | `createTestEditor`, `CommandTester`, `ElementTester`, `RuleTester` for testing your own extensions |

## What it does

- **Parse.** `parseSource(src)` gives one tree of HTML and Liquid nodes with source offsets. `buildTree` turns it into the editor's tree (elements, Liquid blocks with branch slots, content leaves). `pathAtOffset(tree, n)` maps a click to nodes.
- **Edit.** Six operations (`insert`, `move`, `remove`, `setAttribute`, `setText`, `replace`), plus `wrap`, and `readTagArguments` / `setTagArgument` for section settings (`{% section 'hero', headline: "..." %}`). Each is a minimal splice.
- **Editor attributes.** `data-edit-id` (only with persisted identity), `-lock`, `-block` and `-name` are validated by `validateEditAttribute` and removed for publishing by `stripEditAttributes`. The author's own `data-editable="text|image|link"` marks client-editable regions.
- **Custom tags.** `defineTag` registers a tag with both the renderer and the parser, so `{% map %}...{% endmap %}` parses as one block.
- **Lint.** `lint(src)` reports what would break a clean editor tree: Liquid in attribute lists, tags inside attribute values, elements split across branches, dynamic names, malformed HTML.
- **Render.** A sandboxed liquidjs renderer with output escaping on, prototype access off, strict filters, parse/render/memory limits and UTC dates. `include`, `layout` and `block` are removed; `{% paginate %}`, `{% form %}`, `{% section %}` and `{% map %}` are built in.

To add your own tags, filters and data sources, see [Writing tags, filters and data sources](../../docs/extending.md). To connect your own file store, see [Storage adapters](../../docs/storage.md).

## Rendering APIs for hosts

For a host that publishes sites and serves them itself. On `@pagehub/engine/render` unless noted.

```ts
import { matchRoute, pageReads, classesInMarkup, collectSources, renderPage, ENGINE_VERSION } from "@pagehub/engine/render";
import { parseFontFaces, fontHeadTags } from "@pagehub/engine/canvas";
```

**`matchRoute(pages, path) → { page, params } | null`.** Which page a request path belongs to. A page's `url` is
a route: `/about`, or a pattern with `:name` captures (`/plants/:slug`). An exact `url` beats a pattern; among
patterns the first in `pages` order wins; a capture is one non-empty, URL-decoded segment; a trailing slash,
query and hash are ignored. A malformed escape is no match. Feed `params` to `renderPage`'s `request.params`.
`normalizeRoutePath(path)` is the normalizer it uses.

**`pageReads(renderer, page, { gated? }) → Promise<PageReads>`.** What a page reads, found by liquidjs static
analysis over the page and every section and partial it pulls in, not by running it:
`{ query, customer: "none" | "presence" | "fields", gated, time, globals }`. `query` is any `request.query.*`.
`customer` is `presence` when the page only asks whether there is one (`{% if customer %}`, `customer.signed_in`)
and `fields` for any other `customer.<field>`. `time` is the `'now'` literal or a `now` / `today` / `year`
global. `gated` is whatever your `gated(segments)` predicate says. A page that reads none of these can be
rendered once and served as a file. Analysis is per file, so it errs towards "reads it". The renderer's
`variables(path)` gives the raw segments (`[["request", "query", "category"], …]`).

**`classesInMarkup(html) → string[]`.** Every class token in `class="…"` and `data-*-class="…"` attributes of
rendered markup, entity-decoded (`[&amp;_li]:py-1` → `[&_li]:py-1`), deduplicated. This is what a Tailwind
compile should scan for a published page: classes components hard-code in their markup that no source file
carries, and classes the site runtime applies to markup it builds in the browser. Call it on `renderPage`'s `html`.

**`collectSources(renderer, page) → Map<path, source>`.** The page's source plus every `sections/*.liquid` and
`partials/*.liquid` it references, transitively.

**`renderPage(…, { timeoutMs })`.** A wall-clock cap for the Liquid render (default `limits.renderLimit`, 200 ms).
Exceeding it rejects with `RenderTimeoutError`, including a render stuck waiting on a host call.

**`ENGINE_VERSION`.** The engine's version string, to stamp on a release so output
can be re-rendered when the engine changes. A test keeps it equal to `package.json`.

**`parseFontFaces(css) → ParsedFontFace[]`** (`/canvas`). Every `@font-face` rule of a font stylesheet with its
`subset` (the `/* latin */` comment Google Fonts writes), `family`, `style`, `weight`, `display`,
`unicodeRange` and `sources: [{ url, format }]`; `css` keeps the rule as written so a host can rewrite one `url(…)`
and emit the rest unchanged. `fontHeadTags(urls, local)` takes `local.fallbacks`, metric-matched fallback faces
(`{ family, local: ["Arial"], sizeAdjust, ascentOverride, descentOverride, lineGapOverride }`, in percent) and
writes them as `"<Family> Fallback"` rules in the same `<style>`; the host computes the numbers.

## Storage

A storage adapter is `list`, `read`, `write` (optimistic, versioned), and optionally `watch`, `editIds` and `writeBatch`. `memoryStorage` and `fsStorage` come with the engine. Any failure that isn't a version conflict is thrown as a `StorageError` with a `code`. The full contract, the error codes and a worked adapter are in [Storage adapters](../../docs/storage.md).
