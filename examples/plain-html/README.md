# plain-html

A three-page marketing site for a pottery studio, in plain HTML. No Liquid, no build step, no
framework. Native behaviour only:

- `<dialog id="visit">` opened with `commandfor="visit" command="show-modal"`
- a `popover` mobile menu (`popovertarget="menu"`)
- a `<details name="faq">` accordion
- a scroll-snap gallery with `data-autoplay`

```
site/
  index.html  about.html  contact.html
  assets/styles.css  assets/gallery-1.svg …
```

The point: the editor needs nothing but files. Every edit you save is a minimal diff you can read
in `git diff`.

## Open it in the editor

From the repo root:

```sh
npx tsx --conditions=pagehub-source examples/_shared/serve.ts examples/plain-html
# → http://localhost:5170
```

The runner bundles the editor, serves it, and reads and writes `site/` through the engine's
file-system storage. Pick a page in the page selector, click the heading, change the text, save.
`git diff examples/plain-html` shows the one line that changed. (`--port 5171` picks another port.)

Add `?role=client` to the URL for content mode: text and images only, no structure changes.

## Check it without a browser

```sh
npx tsx --conditions=pagehub-source --test examples/plain-html/example.test.ts
```

Asserts that every page parses without errors, renders to exactly its source, and that a text edit
is a one-line diff.
