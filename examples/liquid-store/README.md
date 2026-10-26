# liquid-store

A small plant shop, written in Liquid, with its own sample catalog (`site/catalog.json`, ten
plants). Nothing here comes from Shopify or its themes: the markup, CSS and data are ours.

```
site/
  index.liquid  products.liquid  product.liquid  cart.liquid  contact.liquid
  sections/hero.liquid        a {% schema %} in Shopify's format
  partials/header  footer  product-card
  assets/…                    stylesheet and the plant pictures
  catalog.json                the products and collections
store.ts                      the plug-ins (see below)
editor.config.ts              wires them into the editor
```

- the home page holds `{% section 'hero', headline: "…", photo: "hero", … %}`: a section's
  settings are tag arguments in the page file, declared by the schema in `sections/hero.liquid`
- `products.liquid` has `{% paginate shown by 6 %}` and a GET filter form with `data-autosubmit`
- `product.liquid` is served at `/products/:handle` (the route table is in `store.ts`)
- `cart.liquid` and the buttons use `data-cart`; the promo code uses `data-copy`
- `contact.liquid` uses `{% form 'contact' %}`

## Plug-ins (all in memory, in `store.ts`)

| Point | What it does here |
|---|---|
| data sources | `products`, `collections`, `product` (reads the route's `:handle`) from `catalog.json` |
| tags and filters | `form` (a handler that validates and logs), `image_url` (media id to `/assets/<id>.svg`), `money`, `icon` (a few inline SVGs) |
| settings | `product` and `collection` section settings resolve to catalog rows |
| media | an in-browser media library holding the plant pictures |
| roles | owner by default; `?role=client` is content mode |
| runtime | the `data-cart`, `data-autosubmit`, `data-copy` attributes are inert markup the site runtime picks up on the published page |

There is no product-picker panel: the editor shell has no panel slot to plug one into yet. The
product and collection section settings are the picking mechanism a schema can declare.

## Open it in the editor

From the repo root:

```sh
npx tsx --conditions=pagehub-source examples/_shared/serve.ts examples/liquid-store
# → http://localhost:5170           (owner)
# → http://localhost:5170/?role=client   (content mode: hero argument values and data-editable text only)
```

The canvas renders with the catalog as sample data, so the product grid is real. Saving writes
back to `site/`; `git diff examples/liquid-store` shows only the lines you changed.

## Check it without a browser

```sh
npx tsx --conditions=pagehub-source --test examples/liquid-store/example.test.ts
```

Asserts: no error-level diagnostics; page 2 of the product list slices to 4 items; `/products/monstera`
reaches the data source; missing section arguments render the schema defaults; the contact form
validates; changing the hero's headline is a one-line diff; content mode accepts section
arguments and `data-editable` text and refuses moving a section.
