import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEditor } from "../src/testing/index.ts";
import { componentNames, componentUses, convertTitle, partialNames, renameComponentFiles, uniquePartialName } from "../src/kits/liquid/componentCommands.ts";

const PAGE = "index.liquid";
const SRC = `<main>
  <section class="p-4" data-edit-name="Hero Card">
    <h1>Hi</h1>
  </section>
</main>
`;

const ed = (files: Record<string, string>) => createTestEditor({ files });

describe("component.convert names", () => {
  const convertedName = (markup: string, extra: Record<string, string> = {}) => {
    const e = ed({ [PAGE]: `<main>\n${markup}\n</main>\n`, ...extra });
    e.select(e.get("main").children()[0] ?? e.get("div"));
    assert.ok(e.run("component.convert"));
    return partialNames(e.state.files).filter((n) => !(n in extra && extra[n]!.trim()) && !(`partials/${n}.liquid` in extra))[0];
  };

  it("uses the first heading's text, slugified and capped", () => {
    assert.equal(convertedName(`<div class="p-4"><h2>Our Story &amp; Mission: why we plant trees every year</h2></div>`), "our-story-mission-why");
  });
  it("prefers aria-label over a heading, and skips liquid in heading text", () => {
    assert.equal(convertedName(`<div aria-label="Contact strip"><h2>x</h2></div>`), "contact-strip");
    assert.equal(convertedName(`<div><h3>{{ product.title }} Specials</h3></div>`), "specials");
  });
  it("falls back to an id or class that names a section, then the semantic tag", () => {
    assert.equal(convertedName(`<div class="p-4 hero-wide"><p>x</p></div>`), "hero-wide");
    assert.equal(convertedName(`<footer class="p-4"><p>x</p></footer>`), "footer");
  });
  it("never names a partial after a bare tag: component-N, first free number", () => {
    assert.equal(convertedName(`<div class="p-4"><p>x</p></div>`), "component-1");
    assert.equal(convertedName(`<div class="p-4"><p>x</p></div>`, { "partials/component-1.liquid": "<i>x</i>\n" }), "component-2");
  });
  it("a collision gets a numeric suffix", () => {
    assert.equal(convertedName(`<div><h2>Pricing</h2></div>`, { "partials/pricing.liquid": "<i>x</i>\n" }), "pricing-2");
  });
});

describe("component.convert", () => {
  it("lifts the element into partials/<name>.liquid, leaves {% render %}, one undo step (exact diff)", () => {
    const e = ed({ [PAGE]: SRC });
    e.select(e.get("section"));
    assert.ok(e.run("component.convert"));
    assert.equal(
      e.diff(),
      `--- a/index.liquid
+++ b/index.liquid
@@ -1,5 +1,3 @@
 <main>
-  <section class="p-4" data-edit-name="Hero Card">
-    <h1>Hi</h1>
-  </section>
+  {% render 'hero-card' %}
 </main>
--- a/partials/hero-card.liquid
+++ b/partials/hero-card.liquid
@@ -0,0 +1,3 @@
+<section class="p-4" data-edit-name="Hero Card">
+  <h1>Hi</h1>
+</section>
`,
    );
    assert.equal(e.state.selection.primary?.tag, "render", "the new instance is selected");
    assert.ok(e.undo());
    assert.equal(e.text(PAGE), SRC);
    assert.equal(e.state.files.get("partials/hero-card.liquid"), "");
    assert.deepEqual(partialNames(e.state.files), [], "an emptied partial counts as absent");
  });

  it("picks the next free name and passes enclosing loop variables the markup reads", () => {
    const src = `<ul>
  {% for p in products %}
    <li>{{ p.title }}</li>
  {% endfor %}
</ul>
`;
    const e = ed({ [PAGE]: src, "partials/component-1.liquid": "<li>x</li>\n" });
    assert.equal(uniquePartialName(e.state.files, "component-1"), "component-1-2");
    e.select(e.get("li"));
    assert.ok(e.run("component.convert"));
    assert.equal(e.text(PAGE), src.replace("<li>{{ p.title }}</li>", "{% render 'component-2', p: p %}"));
    assert.equal(e.state.files.get("partials/component-2.liquid"), "<li>{{ p.title }}</li>\n");
  });

  it("can't run on a {% render %} tag: the label reads \"Component exists\"", () => {
    const e = ed({ [PAGE]: `<main>{% render 'card' %}</main>\n`, "partials/card.liquid": "<div>c</div>\n" });
    const tag = e.get("%render");
    e.select(tag);
    assert.equal(e.can("component.convert"), false);
    assert.equal(convertTitle(tag), "Component exists");
    assert.equal(convertTitle(e.get("main")), "Convert to component");
  });
});

describe("component.unlink", () => {
  it("inlines the partial at the {% render %} tag, re-indented, one undo step (exact diff)", () => {
    const page = `<main>
  {% render 'card' %}
</main>
`;
    const e = ed({ [PAGE]: page, "partials/card.liquid": "<div class=\"card\">\n  <p>Body</p>\n</div>\n" });
    e.select(e.get("%render"));
    assert.ok(e.run("component.unlink"));
    assert.equal(
      e.diff(),
      `--- a/index.liquid
+++ b/index.liquid
@@ -1,3 +1,5 @@
 <main>
-  {% render 'card' %}
+  <div class="card">
+    <p>Body</p>
+  </div>
 </main>
`,
    );
    assert.equal(e.state.selection.primary?.tag, "div", "the inlined element is selected");
    assert.ok(e.undo());
    assert.equal(e.text(PAGE), page);
  });

  it("named arguments become {% assign %} lines; with / for forms and missing partials refuse", () => {
    const e = ed({ [PAGE]: `<main>\n  {% render 'card', title: "Hi" %}\n</main>\n`, "partials/card.liquid": "<h2>{{ title }}</h2>\n" });
    e.select(e.get("%render"));
    assert.ok(e.run("component.unlink"));
    assert.equal(e.text(PAGE), `<main>\n  {% assign title = "Hi" %}\n  <h2>{{ title }}</h2>\n</main>\n`);
    const w = ed({ [PAGE]: `<main>{% render 'card' with product as p %}{% render 'gone' %}</main>\n`, "partials/card.liquid": "<b>x</b>\n" });
    w.select(w.get("%render"));
    assert.equal(w.can("component.unlink"), false);
    assert.equal(w.can("component.unlink", { at: w.find(PAGE, "%render")[1]! }), false);
  });
});

describe("component library helpers", () => {
  const files = new Map<string, string>([
    ["pages/index.liquid", `<main>{% render 'card' %}{%- render "card", item: item -%}{% section 'card' %}{% render 'cards' %}</main>`],
    ["pages/about.liquid", `<main>{% render 'header' %}</main>`],
    ["partials/card.liquid", "<b>card</b>\n"],
    ["partials/cards.liquid", "<b>{% render 'card' %}</b>\n"],
    ["partials/header.liquid", "<header></header>\n"],
    ["partials/inject-head.liquid", "{% raw %}<style>.x{}</style>{% endraw %}"],
    ["partials/empty.liquid", ""],
  ]);

  it("componentNames lists partials with content, minus code-only ones", () => {
    assert.deepEqual(componentNames(files), ["card", "cards", "header"]);
  });

  it("componentUses counts render and section tags of exactly that name", () => {
    assert.deepEqual(componentUses(files, "card"), [
      { path: "pages/index.liquid", count: 3 },
      { path: "partials/cards.liquid", count: 1 },
    ]);
    assert.deepEqual(componentUses(files, "header"), [{ path: "pages/about.liquid", count: 1 }]);
  });

  it("renameComponentFiles moves the partial and rewrites every use, keeping quotes and arguments", () => {
    const { writes, remove } = renameComponentFiles(files, "card", "product-card");
    assert.equal(remove, "partials/card.liquid");
    assert.deepEqual(Object.keys(writes).sort(), ["pages/index.liquid", "partials/cards.liquid", "partials/product-card.liquid"]);
    assert.equal(writes["pages/index.liquid"], `<main>{% render 'product-card' %}{%- render "product-card", item: item -%}{% section 'product-card' %}{% render 'cards' %}</main>`);
    assert.throws(() => renameComponentFiles(files, "card", "header"), /already exists/);
  });
});
