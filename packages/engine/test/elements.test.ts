import { test } from "node:test";
import assert from "node:assert/strict";
import { defineElement } from "../src/elements/defineElement.ts";
import { attr, arg, cls, text, tagName } from "../src/elements/bindings.ts";
import { htmlElement, resolveElement } from "../src/elements/resolve.ts";
import { t } from "../src/schema/t.ts";
import { createStore } from "../src/state/store.ts";
import { ElementTester } from "../src/testing/elementTester.ts";
import { SAMPLE } from "./helpers.ts";

const textSize = { id: "text-size", values: ["text-xl", "text-2xl", "text-3xl", "text-4xl", "text-6xl"] };

const heading = defineElement({
  name: "heading",
  match: "h1, h2, h3",
  props: {
    level: tagName(["h1", "h2", "h3"]),
    text: text(),
    size: cls(textSize),
    id: attr("id", t.string().optional()),
    hidden: attr("data-hidden", t.boolean().default(false)),
  },
  insert: { label: "Heading", icon: "tb/TbHeading", template: "<h2>Heading</h2>" },
  describe: "A heading. Level is the tag; size is a Tailwind text-size class.",
});

const mapElement = defineElement({
  name: "map",
  match: { tag: "liquid", name: "map" },
  parseLike: "form",
  props: {
    lat: arg("lat", t.number().min(-90).max(90)),
    lng: arg("lng", t.number()),
    zoom: arg("zoom", t.int().default(14)),
    tiles: arg("tiles", t.enum(["osm"]).default("osm")),
  },
  children: { allow: ["address[data-pin]"] },
  insert: { label: "Map", icon: "tb/TbMap", template: `{% map lat: 34.05, lng: -118.24 %}{% endmap %}` },
  describe: "Interactive map. Pins are <address data-pin> children.",
});

const section = defineElement({
  name: "section-tag",
  match: "%section",
  props: { headline: arg("headline", t.string()), count: arg("count", t.int().optional()) },
  describe: "A section with its settings as tag arguments.",
});

test("elements: attr binding reads (with default) and writes the minimal change", () => {
  ElementTester.run(heading, [
    { code: `<h1 id="top">Hi</h1>`, read: { id: "top", hidden: false } },
    { code: `<h1 data-hidden>Hi</h1>`, read: { hidden: true } },
    { code: `<h1 id="top">Hi</h1>`, write: { prop: "id", value: "intro", output: `<h1 id="intro">Hi</h1>` } },
    { code: `<h1 class="a">Hi</h1>`, write: { prop: "id", value: "x", output: `<h1 class="a" id="x">Hi</h1>` } },
    { code: `<h1 id="top" class="a">Hi</h1>`, write: { prop: "id", value: undefined, output: `<h1 class="a">Hi</h1>` } },
  ]);
});

test("elements: arg binding — {% section %} and {% map %} arguments", () => {
  ElementTester.run(section, [
    { code: `{% section 'hero', headline: "Fresh paint", count: 3 %}`, read: { headline: "Fresh paint", count: 3 } },
    { code: `{% section 'hero', headline: "Fresh paint", count: 3 %}`, write: { prop: "headline", value: `Say "hi"`, output: `{% section 'hero', headline: 'Say "hi"', count: 3 %}` } },
    { code: `{% section 'hero', headline: product.title %}`, read: { headline: undefined } },
  ]);
  const MAP = `{% map lat: 34.1, lng: -118.3 %}\n  <address data-pin>Shop</address>\n{% endmap %}`;
  ElementTester.run(mapElement, [
    { code: MAP, read: { lat: 34.1, lng: -118.3, zoom: 14, tiles: "osm" } },
    { code: MAP, write: { prop: "lat", value: 40.5, output: MAP.replace("34.1", "40.5") } },
    { code: MAP, write: { prop: "zoom", value: 9, output: MAP.replace("-118.3 %}", "-118.3, zoom: 9 %}") } },
  ]);
  assert.throws(() => ElementTester.run(mapElement, [{ code: MAP, write: { prop: "lat", value: 120, output: "" } }]), /≤ 90/);
});

test("elements: cls binding per variant; text and tagName bindings", () => {
  ElementTester.run(heading, [
    { code: `<h1 class="font-heading text-3xl md:text-6xl">X</h1>`, read: { size: "text-3xl" } },
    { code: `<h1 class="font-heading text-3xl md:text-6xl">X</h1>`, variant: "md", read: { size: "text-6xl" } },
    { code: `<h1 class="font-heading text-3xl md:text-6xl">X</h1>`, write: { prop: "size", value: "text-4xl", output: `<h1 class="font-heading text-4xl md:text-6xl">X</h1>` } },
    { code: `<h1 class="text-3xl">X</h1>`, write: { prop: "size", value: "text-6xl", variant: "md", output: `<h1 class="text-3xl md:text-6xl">X</h1>` } },
    { code: `<h1>Fresh &amp; clean</h1>`, read: { text: "Fresh & clean", level: "h1" } },
    { code: `<h1>Fresh</h1>`, write: { prop: "text", value: "A < B", output: `<h1>A &lt; B</h1>` } },
    { code: `<h2 class="x">Hi</h2>`, write: { prop: "level", value: "h3", output: `<h3 class="x">Hi</h3>` } },
  ]);
});

test("elements: resolution by precedence; unknown markup is html.element; props schema", () => {
  const s = createStore({ files: { "a.liquid": SAMPLE }, extensions: [heading] });
  const [h1] = s.find("a.liquid", "h1");
  const nav = s.find("a.liquid", "nav")[0]!;
  assert.ok(h1!.is(heading));
  assert.equal(nav.is(heading), false);
  assert.equal(resolveElement(s.state, nav.node(), s.state.tree("a.liquid")), htmlElement);
  assert.equal((h1 as unknown as { element: { name: string } }).element.name, "heading");
  assert.deepEqual(heading.read(h1!), { level: "h1", text: "Fresh paint,\n        done right.", size: "text-3xl", id: undefined, hidden: false });
  s.dispatch((tr) => heading.write(tr, h1!, "size", "text-4xl"));
  assert.match(s.state.files.get("a.liquid")!, /<h1 class="font-heading text-4xl sm:text-4xl md:text-6xl">/);
  const schema = mapElement.propsSchema() as { properties: Record<string, Record<string, unknown>> };
  assert.equal(schema.properties.zoom!["x-binding"], "arg:zoom");
  assert.equal(schema.properties.lat!.maximum, 90);
});
