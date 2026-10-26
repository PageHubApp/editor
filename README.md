# PageHub Editor

**An open-source, embeddable visual editor for HTML and Liquid. Your files stay your files.**

Click, drag and type on the page as visitors see it, and the editor changes the source file, not a copy of it.

- **Minimal diffs.** Every edit is a small splice of the source text. Bytes you didn't touch stay exactly as they were, so `git diff` shows only what you changed.
- **No JSON model.** The `.html` and `.liquid` files are the document. There's nothing to export, and nothing to get out of sync.
- **Template tags stay editable.** `{% for %}`, `{% if %}`, `{% section %}` and the rest show up in the editor as things you can select, move and configure.
- **Embeddable.** Drop `<Editor>` into your own React app and give it a storage adapter for wherever your files live.
- **MIT licensed.**

## Quick start

You need Node 22.18 or newer and [pnpm](https://pnpm.io) 9.

```bash
pnpm install
echo "SITES_ROOT=$HOME/sites" > .env.local   # a folder whose subfolders are sites
pnpm dev                                      # http://127.0.0.1:5050
```

A site is a folder of `.html` and `.liquid` files. `SITES_ROOT` is a folder that holds several of them, and the top bar lets you switch between them. Without `.env.local` the playground opens `apps/playground/sites/`.

Edits save straight to the files. Open the folder in git and you'll see the change.

To open one folder, such as a bundled example, use the CLI:

```bash
pnpm pagehub-editor open examples/plain-html/site   # open a folder in the editor
pnpm pagehub-editor check ./my-site    # parse and render every page, exit 1 on errors
pnpm pagehub-editor lint ./my-site     # the editor-safety rules over every file
```

## Packages

| Package | What it does |
|---|---|
| [`@pagehub/engine`](packages/engine) | The headless core. Parses HTML and Liquid, applies edits as minimal splices, lints, renders pages (`renderPage`, `matchRoute`), and defines the extension points (tags, filters, data sources, storage). No UI. |
| [`@pagehub/editor`](packages/editor) | The React editor: `<Editor>` and `mountEditor`, the canvas, inspector, layers, code view, theme and media panels. Every piece of UI is a slot you can replace or hide. |
| [`@pagehub/site-runtime`](packages/site-runtime) | The small browser script for published pages. It covers what native HTML can't do: cart, scroll animation, autoplay, copy, dismiss-and-remember, scrollspy and polyfills. A page that uses none of it ships no JavaScript. |
| [`@pagehub/dev-server`](packages/dev-server) | Runs the editor on local folders: a Vite plugin with the file API, per-site Tailwind builds, self-hosted fonts and a chrome-free page preview. |
| [`@pagehub/cli`](packages/cli) | `pagehub-editor open`, `check` and `lint`. Local only, no account. |

There's also [`apps/playground`](apps/playground), the editor as a web app over your own folders (it's what `pnpm dev` runs), and [`examples/`](examples).

## The format in one page

A site is plain HTML with [Liquid](https://shopify.github.io/liquid/) for data. Behavior is native HTML (`<dialog>`, `popover`, `commandfor`, `<details>`, forms, links), and the URL is the state. Logic wraps whole elements, so the visual editor always has a clean tree:

```liquid
<ul class="grid gap-4 md:grid-cols-3">
  {% for service in collections.services limit: 6 %}
    <li class="card">
      <img src="{{ service.image | image_url: width: 800 }}" alt="{{ service.title }}">
      <h3>{{ service.title }}</h3>
    </li>
  {% else %}
    <li>No services yet.</li>
  {% endfor %}
</ul>
```

## Embed it

```tsx
import { mountEditor } from "@pagehub/editor";
import "@pagehub/editor/styles.css";

mountEditor(document.getElementById("editor")!, {
  storage: myStorage, // where your files live; see docs/storage.md
});
```

The [embedding guide](docs/embedding.md) covers the canvas host, layout, replacing parts of the UI and handling save errors.

## Documentation

- [Architecture](docs/architecture.md): how the packages fit together
- [Embedding guide](docs/embedding.md): `<Editor>`, `mountEditor`, `canvasHost`, slots, layout
- [Storage adapters](docs/storage.md): connect the editor to your own file store
- [Tags, filters and data sources](docs/extending.md): extend the Liquid runtime
- [Site runtime attributes](docs/site-runtime.md): every `data-*` attribute the published-page script understands
- [Examples](examples): four sites you can open and edit

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and the DCO sign-off, and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The project name lives in [`brand.json`](brand.json); [`scripts/rename-brand.mjs`](scripts/rename-brand.mjs) changes it everywhere at once.
