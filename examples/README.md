# Examples

Four real sites you can open in the editor. Each one shows a different way to use it.

| Example | Shows |
|---|---|
| [plain-html](plain-html) | No Liquid at all: the editor is a good HTML editor on its own |
| [eleventy](eleventy) | Files on disk in someone else's build tool, edited in place, with a small `git diff` |
| [liquid-store](liquid-store) | Data sources, `{% paginate %}`, `{% form %}`, the cart runtime, `{% schema %}` panels and client mode |
| [imported-zip](imported-zip) | The import path: messy HTML cleaned once, Liquid-like text escaped, then editable |

## Open one in the editor

From the repository root:

```bash
npx tsx --conditions=pagehub-source examples/_shared/serve.ts examples/plain-html
# http://localhost:5170  (--port 5171 picks another port)
```

The runner builds the editor, serves it, and reads and writes the example's `site/` folder through the engine's file-system storage. Edits save straight to the files, so `git diff examples/plain-html` shows exactly what changed. Add `?role=client` to the URL to try content mode (text and images only).

An example that needs more than HTML (extra kits, sample data, a canvas renderer) says so in an `editor.config.ts`, which the runner picks up. That's why the examples open through this runner rather than `pnpm pagehub-editor open`.

`imported-zip` needs its site built first: `npx tsx examples/imported-zip/import.ts`.

## Check one without a browser

Every example has a headless test:

```bash
npx tsx --conditions=pagehub-source --test examples/plain-html/example.test.ts
pnpm --filter @pagehub/examples test        # all four
```

Each asserts that every page parses without errors, renders as expected, and that an edit is a minimal diff.

You can also check the rendered pages with the CLI:

```bash
pnpm pagehub-editor check examples/plain-html/site examples/liquid-store/site
```
