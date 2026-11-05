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

// ── data-edit-row / data-edit-field ─────────────────────────────────────────────────────────

const CARD = `<article class="card">
  <img src="{{ item.image | image_url: width: 600 }}" alt="{{ item.title }}">
  <h3>{{ item.title }}</h3>
  <p>{{ item.description }}</p>
  <span>{{ company.name }}</span>
</article>
`;
const SHOP = `<section>
  <h2>{{ heading.title }}</h2>
  <ul>{% for item in products %}<li class="row"><p>{{ item.description }}</p><b>{{ forloop.index }}</b></li>{% endfor %}</ul>
  <div>{% for item in products %}{% render 'product-card', item: item %}{% endfor %}</div>
</section>
`;
const shopFiles = { "index.liquid": SHOP, "partials/product-card.liquid": CARD };
const shopData = {
  heading: { title: "Shop", id: "h" },
  company: { name: "Moss" },
  products: [
    { id: "p1", title: "One", description: "First", image: "https://x.test/1.jpg" },
    { id: "p2", title: "Two", description: "Second", image: "https://x.test/2.jpg" },
  ],
};
const shopSetup = () => {
  const e = createTestEditor({ files: shopFiles, extensions: [htmlKit()] });
  const host = { imageUrl: (u: string) => u, fileUrl: (n: string) => n, icon: () => undefined };
  const renderer = createRenderer({ files: (p) => e.state.files.get(p), host });
  return { e, renderer };
};

test("a loop variable's output gets the row id per copy and the field", async () => {
  const { e, renderer } = shopSetup();
  const html = await renderCanvas(renderer, e.state, "index.liquid", shopData);
  const ps = [...html.matchAll(/<p data-edit-src="index\.liquid#\d+" data-edit-row="([^"]*)" data-edit-field="([^"]*)">/g)];
  assert.deepEqual(ps.map((m) => [m[1], m[2]]), [["p1", "description"], ["p2", "description"]]);
  // the <li> holds only element children and a forloop global: nothing
  assert.doesNotMatch(html, /<li [^>]*data-edit-row/);
  assert.doesNotMatch(html, /<b [^>]*data-edit-row/);
});

test("a partial rendered with item: item maps each card; img src binds field image", async () => {
  const { e, renderer } = shopSetup();
  const html = await renderCanvas(renderer, e.state, "index.liquid", shopData);
  const imgs = [...html.matchAll(/<img data-edit-src="partials\/product-card\.liquid#\d+" data-edit-row="([^"]*)" data-edit-field="([^"]*)"/g)];
  assert.deepEqual(imgs.map((m) => [m[1], m[2]]), [["p1", "image title"], ["p2", "image title"]]);
  const cardPs = [...html.matchAll(/<p data-edit-src="partials\/product-card\.liquid#\d+" data-edit-row="([^"]*)" data-edit-field="description">/g)];
  assert.deepEqual(cardPs.map((m) => m[1]), ["p1", "p2"]);
});

test("elements without local outputs get nothing (globals, plain text, the card root)", () => {
  const { e } = shopSetup();
  const page = instrumentFile(e.state, "index.liquid");
  const card = instrumentFile(e.state, "partials/product-card.liquid");
  assert.doesNotMatch(page, /<h2 [^>]*data-edit-row/); // `heading` is a global
  assert.doesNotMatch(page, /<section [^>]*data-edit-row/);
  assert.doesNotMatch(card, /<span [^>]*data-edit-row/); // company.name
  assert.doesNotMatch(card, /<article [^>]*data-edit-row/);
  // an unrendered partial has no params: `item` there is not known to be local
  const lone = createTestEditor({ files: { "index.liquid": "<p>x</p>", "partials/product-card.liquid": CARD }, extensions: [htmlKit()] });
  assert.doesNotMatch(instrumentFile(lone.state, "partials/product-card.liquid"), /data-edit-row/);
});

test("an assigned row (detail page) is local; render ... as X binds X", () => {
  const files = {
    "index.liquid": `{% assign car = cars | first %}<h1>{{ car.title }}</h1>{% render 'tile' for cars as car %}{% render 'chip' with cars.first %}`,
    "partials/tile.liquid": `<p>{{ car.model }}</p>`,
    "partials/chip.liquid": `<i>{{ chip.label }}</i>`,
  };
  const e = createTestEditor({ files, extensions: [htmlKit()] });
  assert.match(instrumentFile(e.state, "index.liquid"), /<h1 data-edit-src="index\.liquid#\d+" data-edit-row="\{\{ car\.id \}\}" data-edit-field="title">/);
  assert.match(instrumentFile(e.state, "partials/tile.liquid"), /data-edit-row="\{\{ car\.id \}\}" data-edit-field="model"/);
  assert.match(instrumentFile(e.state, "partials/chip.liquid"), /data-edit-row="\{\{ chip\.id \}\}" data-edit-field="label"/);
});

test("a row without an id renders an empty data-edit-row", async () => {
  const { e, renderer } = shopSetup();
  const html = await renderCanvas(renderer, e.state, "index.liquid", { ...shopData, products: [{ description: "No id" }] });
  assert.match(html, /<p data-edit-src="index\.liquid#\d+" data-edit-row="" data-edit-field="description">No id<\/p>/);
});

test("row attributes don't shift data-edit-src values; handles still resolve; strip gives the plain render", async () => {
  const { e, renderer } = shopSetup();
  for (const path of ["index.liquid", "partials/product-card.liquid"] as const) {
    const text = instrumentFile(e.state, path);
    const values = [...text.matchAll(/data-edit-src="([^"]+)"/g)].map((m) => m[1]!);
    const expected = e.state.tree(path).flat.filter((n) => n.kind === "element").map((n) => `${path}#${n.range.start}`);
    assert.deepEqual(values, expected);
    for (const v of values) assert.equal(handleForSrc(e, v)?.range.from, parseEditSrc(v)!.offset);
  }
  const plain = await renderer.render("index.liquid", shopData);
  assert.equal(stripEditSrc(await renderCanvas(renderer, e.state, "index.liquid", shopData)), plain);
  assert.equal(e.state.files.get("partials/product-card.liquid"), CARD);
});
