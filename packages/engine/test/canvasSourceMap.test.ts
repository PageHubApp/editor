import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/render.ts";
import { htmlKit } from "../src/kits.ts";
import { createTestEditor } from "../src/testing/index.ts";
import { editSrcOf, handleForSrc, includeTagFor, instrumentFile, parseEditSrc, renderCanvas, stripEditSrc } from "../src/canvas/sourceMap.ts";

const PAGE = `<main class="p-4">
  <h1>{{ title }}</h1>
  <ul>
    {% for item in items %}<li class="row">{{ item }}</li>{% endfor %}
  </ul>
  {% render 'header' %}
</main>
`;
const HEADER = `<header><a href="/">Home</a></header>\n`;
const files = { "index.liquid": PAGE, "partials/header.liquid": HEADER };
const data = { title: "Hi", items: ["a", "b", "c"] };

const setup = () => {
  const e = createTestEditor({ files, extensions: [htmlKit()] });
  const renderer = createRenderer({ files: (p) => e.state.files.get(p) });
  return { e, renderer };
};

test("instrumented render minus data-edit-src equals the plain render", async () => {
  const { e, renderer } = setup();
  const plain = await renderer.render("index.liquid", data);
  const canvas = await renderCanvas(renderer, e.state, "index.liquid", data);
  assert.notEqual(canvas, plain);
  assert.equal(stripEditSrc(canvas), plain);
});

test("every element carries <file>#<offset>; the stored source never changes", async () => {
  const { e, renderer } = setup();
  const html = await renderCanvas(renderer, e.state, "index.liquid", data);
  assert.equal(e.text(), PAGE);
  assert.match(html, /<main data-edit-src="index\.liquid#0" class="p-4">/);
  assert.match(html, /<header data-edit-src="partials\/header\.liquid#0">/);
  assert.equal(instrumentFile(e.state, "index.liquid").includes(`data-edit-src="index.liquid#${PAGE.indexOf("<h1")}"`), true);
});

test("a click value maps back to the element handle; {% for %} rows share the template element", async () => {
  const { e, renderer } = setup();
  const html = await renderCanvas(renderer, e.state, "index.liquid", data);
  const rows = [...html.matchAll(/<li data-edit-src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows).size, 1);
  const h = handleForSrc(e, rows[0]);
  assert.equal(h, e.get("li"));
  assert.equal(editSrcOf(h!), rows[0]);
  assert.deepEqual(parseEditSrc("partials/header.liquid#7"), { path: "partials/header.liquid", offset: 7 });
  assert.equal(handleForSrc(e, "index.liquid#9999"), null);
});

test("an element of a partial maps into the partial; the page's include tag is found", () => {
  const { e } = setup();
  assert.equal(handleForSrc(e, "partials/header.liquid#0")?.tag, "header");
  const tag = includeTagFor(e, "index.liquid", "partials/header.liquid");
  assert.equal(tag?.text(), "{% render 'header' %}");
  assert.equal(includeTagFor(e, "index.liquid", "partials/footer.liquid"), null);
});
