# Writing tags, filters and data sources

The Liquid runtime is extendable in three ways. Each is one definition that registers everywhere it needs to be: the renderer, the parser (so lint and the editor see a block tag as one block) and, for data sources, the page renderer.

| You want | Use |
|---|---|
| A new `{% tag %}` | `defineTag` |
| A new `{{ value \| filter }}` | `defineFilter` |
| A new global list or object (`products`, `posts`) | `defineDataSource` |

All three come from `@pagehub/engine/render`. Arguments are described with the schema builder `t` from `@pagehub/engine`.

Once published, the names a template author writes (tags, filters, objects, runtime attributes) are a promise. Add new names; never change what an existing one means.

## Tags

```ts
import { t } from "@pagehub/engine";
import { defineTag } from "@pagehub/engine/render";

export const callout = defineTag({
  name: "callout",
  kind: "block",
  parseLike: "form",
  args: t.hash({ tone: t.enum(["info", "warn"]).default("info") }),
  describe: "A highlighted note.",
  async *render(ctx, { args, body }) {
    yield `<aside class="callout callout-${ctx.escape(args.tone)}">`;
    yield await body!();
    yield "</aside>";
  },
});
```

```liquid
{% callout tone: "warn" %}<p>Check the label first.</p>{% endcallout %}
```

**`kind`** says what shape the tag has:

| `kind` | Written as | `render` receives |
|---|---|---|
| `"tag"` | `{% name a: 1 %}` | `{ args }` |
| `"block"` | `{% name a: 1 %}...{% endname %}` | `{ args, body }`, where `body(scope?)` renders the inner Liquid and returns text. `scope` adds variables visible inside. |
| `"raw"` | `{% name %}...{% endname %}` | `{ raw }`, the unparsed body text |

**`parseLike`** tells the parser which built-in shape to copy: `"form"` (a block with named arguments), `"section"` (a tag with a name and arguments), `"render"`, or `"raw"`. A raw tag must parse like `"raw"`.

**`render`** is a generator that yields strings. What you yield is trusted markup, so escape anything that came from a visitor or from data with `ctx.escape(value)`. `ctx.get(["page", "title"])` reads a variable from the page being rendered.

`args` is a schema. `t.hash({...})` describes named arguments, and each member can be `t.string()`, `t.number()`, `t.boolean()`, `t.enum([...])`, `.optional()`, `.default(v)`, `.min()`, `.max()`, `.int()` and `.describe()`. Arguments are checked before `render` runs, and the same schema drives the inspector form and the generated docs.

## Filters

```ts
import { t } from "@pagehub/engine";
import { defineFilter } from "@pagehub/engine/render";

export const cents = defineFilter({
  name: "cents",
  args: [t.hash({ currency: t.string().optional() })],
  returns: "string",
  describe: "Whole cents to a price string.",
  run(value, args) {
    const options = Object.fromEntries(args.filter(Array.isArray) as [string, unknown][]);
    return `${options.currency ?? "$"}${(Number(value) / 100).toFixed(2)}`;
  },
});
```

```liquid
{{ 1999 | cents: currency: "€" }}
```

That renders `€19.99`.

`args` is one schema per positional argument. A trailing `t.hash({...})` describes `key: value` options, which liquidjs delivers to `run` as `[key, value]` pairs. `run` gets the raw value and argument list, and must be pure and cheap.

`returns` is `"string" | "url" | "number" | "html" | "array" | "object"`. Return `"html"` only for markup you built safely: it lets the template use `| raw` and writes the output unescaped when it ends the chain.

## Data sources

```ts
import { defineDataSource } from "@pagehub/engine/render";

export const products = defineDataSource({
  name: "products",
  liquid: { global: "products", lazy: true },
  async query({ request, page }, ctx) {
    const rows = await loadProducts({ category: request.query?.category });
    return rows; // plain JSON only
  },
  cache: { ttl: 60_000 },
  preview: { sampleRows: 3 },
});
```

```liquid
{% for product in products %}<h3>{{ product.name }}</h3>{% endfor %}
```

- `query` runs on your side of the sandbox, so credentials stay with you. Its result must be plain JSON; it's checked on every call because it crosses into the sandbox.
- `liquid.global` is the variable name. It can't reuse a built-in object (`site`, `page`, `pages`, `request`, `routes`, `section`, `form`, `paginate`, `forloop`, `tablerowloop`).
- `lazy: true` queries the source only when the page, or a section or partial it pulls in, mentions the global.
- `cache.ttl` (milliseconds) memoizes by `cache.key(q)`, which defaults to the request path, query and params.
- `visitorDependent: true` marks rows that depend on who's asking (a signed-in customer's orders). Such a source is never cached by the engine, and `renderPage` reports `visitorDependent` in its result so you don't edge-cache the page.
- `preview.sample` / `preview.sampleRows` give the editor canvas something to show.

## Use them

**Rendering.** Pass the definitions to the renderer and to `renderPage`:

```ts
import { createRenderer, renderPage } from "@pagehub/engine/render";

const renderer = createRenderer({ files, extensions: [callout, cents, products] });
const { html } = await renderPage(renderer, page, request, { dataSources: [products], site });
```

`extensions` accepts nested arrays, so a plugin can export a list. Defining a name twice, or a name the core already owns, throws a `ConfigError` when the renderer is created.

**Editing.** Add the same definitions to the editor so the parser and lint treat `{% callout %}` as one block:

```ts
import { createEditor } from "@pagehub/engine";
import { htmlKit, liquidKit } from "@pagehub/engine/kits";

const editor = await createEditor({
  storage,
  extensions: [htmlKit(), liquidKit(), callout, cents],
});
```

With `<Editor storage={...} extensions={[...]} />` the editor opens the core for you; pass the kits you want first.

**In a worker.** `@pagehub/engine/worker` runs a renderer off the main thread. Because code never travels in a message, you give it module specifiers (URLs). Every exported `defineTag`, `defineFilter` and `defineDataSource` value in those modules is installed.

## Testing

`@pagehub/engine/testing` has `createTestEditor`, `CommandTester`, `ElementTester` and `RuleTester`. For a tag or filter, `createRenderer` with a `files` map and a call to `renderer.render(path, data)` is enough.

## Elements, commands and rules

The editor side has matching definitions: `defineElement` (how a kind of element is matched, what its props are, how it shows in the inspector), `defineCommand` (a named action with a keybinding) and `defineRule` (a lint rule). They're exported from `@pagehub/engine`, bundled into kits, and passed in `extensions` the same way. The built-in kits (`htmlKit`, `liquidKit`, `tailwindKit` from `@pagehub/engine/kits`) are the best examples to read.
