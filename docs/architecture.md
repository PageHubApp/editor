# Architecture

The editor is built around one rule: **the source file is the document.** There's no intermediate model to convert to and from, so a file you never touch is never rewritten.

## The packages

```
                  ┌──────────────────────┐
                  │   @pagehub/editor    │  React UI: canvas, inspector, layers, panels
                  └──────────┬───────────┘
                             │ uses
                  ┌──────────▼───────────┐        ┌─────────────────────────┐
 your storage ───►│   @pagehub/engine    │◄───────│  @pagehub/dev-server    │ files, CSS, fonts, preview
                  │ parse · edit · lint  │        │  @pagehub/cli           │ open · check · lint
                  │ render · storage     │        └─────────────────────────┘
                  └──────────┬───────────┘
                             │ rendered pages load
                  ┌──────────▼───────────┐
                  │ @pagehub/site-runtime│  small browser script for published pages
                  └──────────────────────┘
```

| Package | Layer | Runs in |
|---|---|---|
| `@pagehub/engine` | Source text, edits, rules, rendering, storage contract | Node, browser, worker |
| `@pagehub/editor` | The visual editor on top of the engine | Browser (React 19) |
| `@pagehub/site-runtime` | Behavior for published pages | Visitors' browsers |
| `@pagehub/dev-server` | Local host: a Vite plugin over a folder of sites | Node |
| `@pagehub/cli` | `open`, `check`, `lint` | Node |

The engine has no UI and no DOM. The editor never talks to a disk or a URL; it only talks to the engine and to the host you give it.

## The source is the document

A site is a set of `.html` and `.liquid` files plus a few JSON files for pages and data. The engine keeps their text, and a tree built from that text, with every node carrying its source offsets.

An edit is a **transaction**: a list of splices (`from`, `to`, `insert`) against the current text. Applying it changes only the bytes inside those ranges, so indentation, comments, attribute order and anything else you wrote stay put. After every edit the result is parsed again in strict mode; an edit that would produce source the editor can't read is refused.

```
click on canvas ─► node handle ─► command ─► transaction (splices) ─► new text ─► new tree
                                                                         │
                                                              history · diff · save
```

Things that follow from this:

- **Handles, not ids.** A node is addressed by its position in the tree. A `data-edit-id` is only written when you ask for persisted identity.
- **Logic wraps whole elements.** `{% for %}` and `{% if %}` surround complete elements. A tag inside an attribute list, or an element split across `{% if %}` branches, is rejected by `lint`, because the editor couldn't give it a clean tree.
- **Section settings are tag arguments.** `{% section 'hero', headline: "..." %}` holds the values; the section's `{% schema %}` describes the inspector form.
- **Undo is text.** History stores the splices, so undo and redo are exact.

## The canvas

The canvas renders the real page. The engine renders each file with its Liquid and stamps every element with where it came from (`data-edit-src`), so a click maps back to a node in the source. The page runs in an isolated frame with the site's own stylesheet, fonts and, in edit mode, the site runtime. The frame is rewritten on each render. Data-bound pages use sample data you provide.

What the canvas needs from outside (CSS, fonts, runtime script, filter providers) is the [canvas host](embedding.md#the-canvas-host).

## Extension points

Everything extendable is a definition that registers through one facet system, so it composes and is tested the same way:

| Definition | Adds |
|---|---|
| `defineTag`, `defineFilter`, `defineDataSource` | Liquid: new tags, filters and data globals. See [extending](extending.md). |
| `defineElement` | How a kind of element is matched, its props, its inspector form and lint rules |
| `defineCommand` | A named action with a keybinding |
| `defineRule` | A lint rule |
| `defineStorage` | Where the files live. See [storage](storage.md). |
| Kits (`htmlKit`, `liquidKit`, `tailwindKit`) | A bundle of the above for HTML, Liquid and Tailwind classes |
| The components map | Replace or hide any piece of the editor's UI. See [embedding](embedding.md). |

## Two runtimes with similar names

- The **template runtime** is part of the engine. It renders Liquid to HTML, sandboxed: output escaping on, no prototype access, strict filters, hard limits on time and memory. It runs on a server, in a worker, or in the canvas.
- The **site runtime** (`@pagehub/site-runtime`) is a script that runs in a visitor's browser after the HTML arrives. It reads `data-*` attributes. See the [attribute reference](site-runtime.md).

## From edit to published page

1. The editor saves changed files through your storage adapter. A save is one `writeBatch` when the storage has it, and a stale file is a conflict, never an overwrite.
2. To serve a page, match the URL to a page (`matchRoute`), then render it (`renderPage`) with your data sources. `pageReads` tells you whether a page depends on the request, the visitor or the clock; one that doesn't can be rendered once and served as a file.
3. Scan the output with `classesInMarkup` to compile just the Tailwind classes the page uses.
4. Add the site runtime script only if `needsRuntime(html)` says the page uses it.

The dev server does exactly these steps for a local folder (`/~view/<site>/<route>`), so it's a working reference for a host.

## Safety

- Rendering is sandboxed, and a render has a wall-clock cap (`timeoutMs`, 200 ms by default).
- Data-source results must be plain JSON, checked on every call.
- Tags yield trusted markup; escape visitor data with `ctx.escape`.
- Editor attributes (`data-edit-*`) are stripped before publishing with `stripEditAttributes`.
- To report a vulnerability, see [SECURITY.md](../SECURITY.md).
