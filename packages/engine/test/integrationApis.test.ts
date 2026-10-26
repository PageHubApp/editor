import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRenderer } from "../src/runtime/createRenderer.ts";
import { RenderTimeoutError } from "../src/runtime/createRenderer.ts";
import { renderPage, collectSources } from "../src/runtime/renderPage.ts";
import { pageReads } from "../src/runtime/pageReads.ts";
import { classesInMarkup } from "../src/runtime/classesInMarkup.ts";
import { ENGINE_VERSION } from "../src/version.ts";
import { parseFontFaces, fontHeadTags, fallbackFaceCss } from "../src/canvas/fontLinks.ts";
import * as render from "../src/render.ts";
import * as canvas from "../src/canvas.ts";

const mk = (files: Record<string, string>) => {
  const r = createRenderer({ files: (p) => files[p] });
  return { r, page: (path: string) => ({ path, url: "/", source: files[path]! }) };
};

test("the integration APIs are on ./render and ./canvas", () => {
  for (const n of ["matchRoute", "pageReads", "classesInMarkup", "collectSources", "ENGINE_VERSION", "renderPage"]) assert.ok(n in render, n);
  for (const n of ["parseFontFaces", "fontHeadTags"]) assert.ok(n in canvas, n);
});

test("pageReads: a static page reads nothing visitor-specific", async () => {
  const { r, page } = mk({ "pages/a.liquid": `<h1>{{ page.title }}</h1>{% for p in products %}{{ p.title }}{% endfor %}` });
  const reads = await pageReads(r, page("pages/a.liquid"));
  assert.deepEqual(reads, { query: false, customer: "none", gated: false, time: false, globals: ["page", "products"] });
});

test("pageReads: request.query, in the page or in a section it pulls in", async () => {
  const { r, page } = mk({
    "pages/a.liquid": `{% section 'filters' %}`,
    "sections/filters.liquid": `{% assign c = request.query.category %}{{ c }}`,
    "pages/b.liquid": `{{ request.path }}{{ request.params.slug }}`,
  });
  assert.equal((await pageReads(r, page("pages/a.liquid"))).query, true);
  assert.equal((await pageReads(r, page("pages/b.liquid"))).query, false);
});

test("pageReads: customer presence vs fields, through partials", async () => {
  const { r, page } = mk({
    "pages/presence.liquid": `{% if customer %}My account{% else %}Sign in{% endif %}`,
    "pages/signed.liquid": `{% if customer.signed_in %}in{% endif %}`,
    "pages/fields.liquid": `{% render 'hello' %}`,
    "partials/hello.liquid": `Hi {{ customer.name }}`,
    "pages/both.liquid": `{% if customer %}x{% endif %}{{ customer.email }}`,
    "pages/none.liquid": `{{ site.name }}`,
  });
  const c = async (p: string) => (await pageReads(r, page(p))).customer;
  assert.equal(await c("pages/presence.liquid"), "presence");
  assert.equal(await c("pages/signed.liquid"), "presence");
  assert.equal(await c("pages/fields.liquid"), "fields");
  assert.equal(await c("pages/both.liquid"), "fields");
  assert.equal(await c("pages/none.liquid"), "none");
});

test("pageReads: time and the host's gated predicate", async () => {
  const { r, page } = mk({
    "pages/year.liquid": `© {{ 'now' | date: "%Y" }}`,
    "pages/dq.liquid": `{{ "now" | date: "%Y" }}`,
    "pages/members.liquid": `{% for p in members.posts %}{{ p }}{% endfor %}`,
    "pages/plain.liquid": `static`,
  });
  assert.equal((await pageReads(r, page("pages/year.liquid"))).time, true);
  assert.equal((await pageReads(r, page("pages/dq.liquid"))).time, true);
  assert.equal((await pageReads(r, page("pages/plain.liquid"))).time, false);
  const gated = (s: readonly string[]) => s[0] === "members";
  assert.equal((await pageReads(r, page("pages/members.liquid"), { gated })).gated, true);
  assert.equal((await pageReads(r, page("pages/members.liquid"))).gated, false);
});

test("pageReads: unknown section tags are tolerated, a missing file throws", async () => {
  const { r, page } = mk({ "pages/a.liquid": `{% section 'nope' %}{{ request.query.q }}` });
  assert.equal((await pageReads(r, page("pages/a.liquid"))).query, true);
  await assert.rejects(r.variables("pages/missing.liquid"), /file not found/);
});

test("collectSources follows sections and partials transitively", () => {
  const { r, page } = mk({
    "pages/a.liquid": `{% section 'one' %}`,
    "sections/one.liquid": `{% render 'two' %}`,
    "partials/two.liquid": `leaf`,
  });
  assert.deepEqual([...collectSources(r, page("pages/a.liquid")).keys()], ["pages/a.liquid", "sections/one.liquid", "partials/two.liquid"]);
});

test("renderPage honours timeoutMs", async () => {
  const files = { "pages/loop.liquid": `{% for i in (1..100000) %}{% for j in (1..100000) %}{{ i }}{% endfor %}{% endfor %}` };
  const { r, page } = mk(files);
  await assert.rejects(renderPage(r, page("pages/loop.liquid"), { path: "/" }, { site: {}, dataSources: [], timeoutMs: 30 }), RenderTimeoutError);
});

test("classesInMarkup: tokens, entity decoding, data-*-class, dedupe", () => {
  const html = `<div class="a  b&#39;c [&amp;_li]:py-1"><p class="a z" data-row-class="grid &quot;x&quot;"></p><i data-class="no" class=""></i></div>`;
  assert.deepEqual(classesInMarkup(html), ["a", "b'c", "[&_li]:py-1", "z", "grid", '"x"']);
  assert.deepEqual(classesInMarkup("<p>no classes</p>"), []);
  assert.deepEqual(classesInMarkup(`<p classy="x" myclass="y">`), []);
});

test("ENGINE_VERSION equals package.json's version", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(ENGINE_VERSION, pkg.version);
});

const GOOGLE = `/* cyrillic */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v1/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin */
@font-face {
  font-family: "Playfair Display";
  font-style: italic;
  font-weight: 400;
  src: url("https://fonts.gstatic.com/s/p/lat.woff2") format("woff2"), url(/x.ttf);
}
@font-face { font-family: Plain; src: local(Arial); }`;

test("parseFontFaces reads subset, descriptors and sources", () => {
  const faces = parseFontFaces(GOOGLE);
  assert.equal(faces.length, 3);
  assert.deepEqual(faces.map((f) => f.subset), ["cyrillic", "latin", null]);
  assert.equal(faces[0]!.family, "Inter");
  assert.equal(faces[0]!.weight, "100 900");
  assert.equal(faces[0]!.display, "swap");
  assert.equal(faces[0]!.unicodeRange, "U+0301, U+0400-045F");
  assert.deepEqual(faces[0]!.sources, [{ url: "https://fonts.gstatic.com/s/inter/v1/cyr.woff2", format: "woff2" }]);
  assert.equal(faces[1]!.family, "Playfair Display");
  assert.equal(faces[1]!.style, "italic");
  assert.equal(faces[1]!.display, null);
  assert.deepEqual(faces[1]!.sources, [{ url: "https://fonts.gstatic.com/s/p/lat.woff2", format: "woff2" }, { url: "/x.ttf", format: null }]);
  assert.deepEqual(faces[2]!.sources, []);
  assert.ok(faces[0]!.css.startsWith("@font-face") && faces[0]!.css.endsWith("}"));
  assert.deepEqual(parseFontFaces("body{color:red}"), []);
});

test("fontHeadTags: fallback faces ride in the same style", () => {
  const fb = { family: "Inter", local: ["Arial"], sizeAdjust: 107.4, ascentOverride: 90.2, descentOverride: 22.5, lineGapOverride: 0 };
  assert.equal(fallbackFaceCss(fb), `@font-face{font-family:"Inter Fallback";src:local("Arial");size-adjust:107.4%;ascent-override:90.2%;descent-override:22.5%;line-gap-override:0%}`);
  const tags = fontHeadTags(["https://fonts.googleapis.com/css2?family=Inter"], { css: "/*x*/", preload: ["/f/a.woff2"], fallbacks: [fb] });
  assert.match(tags, /<link rel="preload" as="font"[^>]*href="\/f\/a\.woff2">/);
  assert.match(tags, /<style data-site-font>\/\*x\*\/@font-face\{font-family:"Inter Fallback"/);
  // without a fallback the output is unchanged
  assert.equal(fontHeadTags(["u"], { css: "c", preload: [] }), `<style data-site-font>c</style>`);
});
