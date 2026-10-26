# eleventy

A real [Eleventy 3](https://www.11ty.dev/) project: the site of a neighbourhood community garden.
Liquid templates, a layout chain, partials, a data file and a markdown blog with front matter.

```
site/                      the Eleventy project (npm start / npm run build)
  eleventy.config.js
  package.json
  src/
    index.liquid  about.liquid  blog.liquid       pages, each with front matter
    layouts/base.liquid  layouts/post.liquid      {{ content }} wraps the page
    partials/header.liquid  footer.liquid         {% render 'header', site: site %}
    blog/*.md  blog/blog.json                     posts (front matter), tagged `post` by directory data
    _data/site.json                               global data
    assets/styles.css                             passed through
eleventy.ts                the host side (see below)
editor.config.ts           wires it into the editor
```

The point: the editor edits files another tool builds. Eleventy keeps building `site/src`; the
editor changes only the bytes you touch, so front matter, formatting and the markdown posts are left
exactly as they were.

## What the editor needs from Eleventy (`eleventy.ts`)

The engine knows nothing about 11ty. These are host plug-ins, no engine change:

- **front matter**: the leading `--- … ---` block is parsed for `title`, `layout`, `permalink`; the
  page is rendered without it, and the editor keeps pointing at the right bytes in the real file
- **layouts**: `layouts/<name>` wraps the page and receives it as `{{ content }}`, chained
- **collections**: `collections.post` is built from `blog/*.md` (front matter + directory data), oldest first
- **filters**: `url` is registered with `defineFilter`
- **data**: `_data/*.json` become globals (`site`)

`{% include %}` is not used. Eleventy's Liquid supports `{% render %}`, which is what the engine
supports too, so the templates run unchanged in both. Pass what a partial needs explicitly
(`site: site`), as Shopify's `render` does.

## Open it in the editor

From the repo root:

```sh
npx tsx --conditions=pagehub-source examples/_shared/serve.ts examples/eleventy
# → http://localhost:5170
```

The editor opens `site/src`. Pages are the three `.liquid` files; `layouts/` and `partials/` open as
includes (click an element in the header and you edit `partials/header.liquid`). Edit the heading
on About and save: `git diff` shows one line, and the front matter above it is untouched.

The Markdown posts are content you write in your editor of choice; the blog page lists them.

## Build the site with Eleventy

```sh
cd examples/eleventy/site
npm install
npm start          # or: npm run build  → _site/
```

(Not run by this repo's tests: it needs the `@11ty/eleventy` package from npm.)

## Check it without a browser

```sh
npx tsx --conditions=pagehub-source --test examples/eleventy/example.test.ts
```

Asserts that the layouts and partials lint clean, the listing renders all four posts newest first
inside the layout, the home page shows the latest three, and an edit leaves the front matter
byte-exact with a one-line diff.
