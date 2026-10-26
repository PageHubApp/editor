import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { templateToPage, type ShopifyTemplate } from "../src/import/shopifyTemplates.ts";
import type { SectionSchema } from "../src/runtime/tags/schema.ts";
import { lint } from "../src/lint/lint.ts";
import { createRenderer } from "../src/runtime/createRenderer.ts";

const template: ShopifyTemplate = JSON.parse(fs.readFileSync(new URL("./fixtures/shopify/index.json", import.meta.url), "utf8"));
const schemas: Record<string, SectionSchema> = {
  hero: { name: "Hero", settings: [
    { type: "text", id: "heading", label: "Heading" },
    { type: "image_picker", id: "photo", label: "Photo" },
    { type: "range", id: "overlay", label: "Overlay", min: 0, max: 100 },
    { type: "checkbox", id: "show_badge", label: "Badge", default: true },
  ] },
  "featured-collection": { name: "Featured", settings: [
    { type: "text", id: "title", label: "Title" },
    { type: "collection", id: "collection", label: "Collection" },
    { type: "number", id: "columns", label: "Columns" },
  ] },
  "rich-text": { name: "Text", settings: [{ type: "textarea", id: "text", label: "Text" }] },
};

test("template converts to section tags in order, skipping disabled", () => {
  const { source } = templateToPage(template, schemas);
  assert.equal(source.trim().split("\n").length, 3);
  assert.match(source, /^\{% section 'hero', heading: "Fresh brews", photo: "shopify:\/\/shop_images\/hero\.jpg", overlay: 40, show_badge: false %\}$/m);
  assert.match(source, /\{% section 'rich-text', text: "Hello" %\}/);
  assert.ok(!source.includes("Old"));
});

test("a value with both quote kinds is reported, others are quoted by liquidString", () => {
  const { source, report } = templateToPage(template, schemas);
  assert.match(source, /\{% section 'featured-collection', collection: "all", columns: 4 %\}/);
  const f = report.find((r) => r.section === "featured")!;
  assert.deepEqual(f.dropped, ["title", "blocks"]);
  const single = templateToPage({ sections: { a: { type: "rich-text", settings: { text: 'say "hi"' } } }, order: ["a"] }, schemas);
  assert.match(single.source, /text: 'say "hi"'/);
});

test("unknown settings, disabled and missing entries and blocks are reported", () => {
  const { report } = templateToPage(template, schemas);
  assert.deepEqual(report.find((r) => r.section === "hero_1")!.dropped, ["bogus"]);
  assert.match(report.find((r) => r.section === "old")!.reason, /disabled/);
  assert.match(report.find((r) => r.section === "ghost")!.reason, /missing/);
  assert.match(report.find((r) => r.section === "featured")!.reason, /blocks/);
});

test("a wrongly typed value is reported, not written; no schema drops every setting", () => {
  const r = templateToPage({ sections: { a: { type: "hero", settings: { overlay: "40" } }, b: { type: "nope", settings: { x: 1 } } }, order: ["a", "b"] }, schemas);
  assert.equal(r.source, "{% section 'hero' %}\n{% section 'nope' %}\n");
  assert.deepEqual(r.report.map((e) => e.dropped), [["overlay"], ["x"]]);
});

test("output lints clean and renders with the section files in a bundle", async () => {
  const { source } = templateToPage(template, schemas);
  assert.deepEqual(lint(source), []);
  const files: Record<string, string> = {
    "pages/index.liquid": source,
    "sections/hero.liquid": `<h1>{{ section.settings.heading }}</h1>{% if section.settings.show_badge %}<b>badge</b>{% endif %}{% schema %}${JSON.stringify(schemas.hero)}{% endschema %}`,
    "sections/featured-collection.liquid": `<h2>cols {{ section.settings.columns }}</h2>{% schema %}${JSON.stringify(schemas["featured-collection"])}{% endschema %}`,
    "sections/rich-text.liquid": `<p>{{ section.settings.text }}</p>{% schema %}${JSON.stringify(schemas["rich-text"])}{% endschema %}`,
  };
  const html = await createRenderer({ files: (p) => files[p] }).render("pages/index.liquid", {});
  assert.match(html, /<h1>Fresh brews<\/h1>/);
  assert.ok(!html.includes("badge"));
  assert.match(html, /cols 4/);
});
