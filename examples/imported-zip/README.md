# imported-zip

A site as a typical site builder exports it, zipped: a small cafe site whose HTML is messy in the
ways real exports are.

`input/site/` (zipped as `input/site.zip`) holds three pages with:

- uppercase tags (`<HTML>`, `<DIV>`, `<H1>`) and unclosed `<p>` and `<li>`
- inline `onclick="…"` handlers, a `javascript:` link and an inline `<script>`
- a Vue snippet with `{{ seatsFree }}` in it, which Liquid would otherwise try to run
- the same `<header>` and `<footer>` pasted into every page

## Import it

From the repo root:

```sh
npx tsx examples/imported-zip/import.ts
```

That unzips `input/site.zip`, runs the engine's `importSite` (per page `importHtml`, then
`liftPartials` across pages) and writes the result to `site/` (git-ignored; delete it and run again
any time). It prints the report:

```
pages/index.liquid: rewritten by the HTML parser once (…); 1 Liquid-looking spot(s) made literal; 0 sanitizer fix(es); 3 script(s) kept: …; lints clean
partials/header.liquid: lifted from 3 pages (…)
partials/footer.liquid: lifted from 3 pages (…)
copied untouched: css/style.css
```

What the import did, in order:

1. messy markup is rewritten once by the HTML parser (the one time formatting is not preserved)
2. `{{ seatsFree }}` becomes `{% raw %}…{% endraw %}`, so it renders as the literal text Vue expects
3. the sanitizer removes `onclick`, `javascript:` links and `<script>` and says so in the report
4. the identical header and footer move to `partials/header.liquid` and `partials/footer.liquid`,
   and each page gets `{% render 'header' %}` / `{% render 'footer' %}`
5. what remains lints clean, so every page can be saved

Pass your own zip: `npx tsx examples/imported-zip/import.ts path/to/site.zip` (a single wrapping
folder inside the zip is removed; images and other binary files are copied as they are).

## Edit the result

```sh
npx tsx --conditions=pagehub-source examples/_shared/serve.ts examples/imported-zip
# → http://localhost:5170
```

Pick a page, change the heading, save. From here it is an ordinary site: `git diff` shows one line.

## Check it without a browser

```sh
npx tsx --conditions=pagehub-source --test examples/imported-zip/example.test.ts
```

Asserts the report counts, that the site's own JS is kept and listed, that the header and footer were
lifted, that the result lints clean and the Vue braces survive rendering, that the zip reader and
writer round-trip, and that an edit is a one-line diff. `make-zip.ts` rebuilds `input/site.zip`
from `input/site/`.
