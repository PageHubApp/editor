import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/liquid/engine.ts";
import { builtinTags, builtinParserTags } from "../src/runtime/tags/builtinTags.ts";
import { readSchema, validateSchema, sectionSettingsFromArgs, type SectionSchema } from "../src/runtime/tags/schema.ts";
import { parseSource, readTagArguments, NodeTypes, type TagWithArguments } from "../src/index.ts";
import { createParserEnvironment } from "../src/parse/environment.ts";
import type { FormHandler } from "../src/runtime/tags/form.ts";

const HERO = `<section class="hero"><h1>{{ section.settings.headline }}</h1><p>{{ section.settings.count | plus: 1 }}</p>{% if section.settings.show_badge %}<b>badge</b>{% endif %}<i>{{ leak }}</i>{% assign inner = 'x' %}</section>
{% schema %}
{ "name": "Hero", "settings": [
  { "type": "header", "content": "Text" },
  { "type": "text", "id": "headline", "label": "Headline", "default": "Your headline" },
  { "type": "number", "id": "count", "label": "Count", "default": 1 },
  { "type": "checkbox", "id": "show_badge", "label": "Badge" },
  { "type": "product", "id": "item", "label": "Item" },
  { "type": "product_list", "id": "items", "label": "Items", "limit": 2 }
] }
{% endschema %}`;

function setup(handler: FormHandler = () => ({ ok: true })) {
  const files: Record<string, string> = { "sections/hero.liquid": HERO };
  const tags = builtinTags({
    files: (p) => files[p],
    formHandler: handler,
    resolveSetting: (type, handle) => (handle === "gone" ? null : { type, handle, title: handle.toUpperCase() }),
  });
  return createEngine({ tags });
}

test("section: schema defaults, argument overrides, coercion, wrong type ignored", async () => {
  const liquid = setup();
  assert.match(await liquid.parseAndRender(`{% section 'hero' %}`), /<h1>Your headline<\/h1><p>2<\/p>/);
  const out = await liquid.parseAndRender(`{% section 'hero', headline: "Walk-ins", count: 5, show_badge: true, nope: 1 %}`);
  assert.match(out, /<h1>Walk-ins<\/h1><p>6<\/p><b>badge<\/b>/);
  // count given as a string is the wrong literal type: the default stays
  assert.match(await liquid.parseAndRender(`{% section 'hero', count: "9" %}`), /<p>2<\/p>/);
  // escaping stays on
  assert.match(await liquid.parseAndRender(`{% section 'hero', headline: "<b>x</b>" %}`), /&lt;b&gt;x&lt;\/b&gt;/);
});

test("section: isolated scope — sees render data, not the page's assigns, and does not leak its own", async () => {
  const liquid = setup();
  const out = await liquid.parseAndRender(`{% assign leak = 'page-assign' %}{% section 'hero' %}[{{ inner }}]`);
  assert.match(out, /<i><\/i>/);
  assert.ok(out.endsWith("[]"));
  const data = await liquid.parseAndRender(`{% section 'hero' %}`, { leak: "from-data" });
  assert.match(data, /<i>from-data<\/i>/);
});

test("section: resource settings resolve through resolveSetting", async () => {
  const liquid = setup();
  const files = { "sections/r.liquid": `{{ section.settings.item.title }}|{% for p in section.settings.items %}{{ p.handle }},{% endfor %}|{{ section.settings.none }}
{% schema %}{"name":"R","settings":[{"type":"product","id":"item","label":"I"},{"type":"product_list","id":"items","label":"L","limit":2},{"type":"product","id":"none","label":"N"}]}{% endschema %}` };
  const l2 = createEngine({ tags: builtinTags({ files: (p) => (files as Record<string, string>)[p], formHandler: () => ({ ok: true }), resolveSetting: (t, h) => (h === "gone" ? null : { handle: h, title: h.toUpperCase() }) }) });
  assert.equal(await l2.parseAndRender(`{% section 'r', item: "shoe", items: "a, gone, b, c" %}`), "SHOE|a,|\n"); // limit 2 applies before unresolved handles drop
  assert.equal(await l2.parseAndRender(`{% section 'r', items: "a, b, gone" %}`), "|a,b,|\n");
  void liquid;
});

test("section: missing file and bad name are errors", async () => {
  const liquid = setup();
  await assert.rejects(liquid.parseAndRender(`{% section 'nope' %}`), /not found/);
  await assert.rejects(liquid.parseAndRender(`{% section '../x' %}`), /invalid section name/);
});

test("schema and doc render nothing, even with Liquid-looking JSON", async () => {
  const liquid = setup();
  assert.equal(await liquid.parseAndRender(`a{% schema %}{"name":"{{ x }}"}{% endschema %}b{% doc %}@param {{ y }}{% enddoc %}c`), "abc");
});

test("style: wraps the rendered body", async () => {
  const liquid = setup();
  assert.equal(await liquid.parseAndRender(`{% style %}.a{width:{{ w }}px}{% endstyle %}`, { w: 4 }), "<style>.a{width:4px}</style>");
});

test("map: block tag emits [data-map] config and keeps children; parser sees it as a block", async () => {
  const liquid = setup();
  const out = await liquid.parseAndRender(`{% map lat: 33.8, lng: -118.3, zoom: 13 %}<i data-pin>x</i>{% endmap %}`);
  assert.equal(out, `<div data-map="{&quot;lat&quot;:33.8,&quot;lng&quot;:-118.3,&quot;zoom&quot;:13}"><i data-pin>x</i></div>`);
  const env = createParserEnvironment(builtinParserTags());
  const ast = parseSource(`{% map lat: 1 %}<i></i>{% endmap %}`, "strict", { env } as never);
  const tag = ast.children[0] as { type: string; name: string; children?: unknown[] };
  assert.equal(tag.type, NodeTypes.LiquidTag);
  assert.equal(tag.name, "map");
  assert.ok(tag.children && tag.children.length === 1);
});

test("map: class goes on the map element, not into the config", async () => {
  const out = await setup().parseAndRender(`{% map lat: 1, lng: 2, class: "h-full rounded-box" %}{% endmap %}`);
  assert.equal(out, `<div class="h-full rounded-box" data-map="{&quot;lat&quot;:1,&quot;lng&quot;:2}"></div>`);
});

test("form: renders a post form with hidden form_type and class", async () => {
  const liquid = setup();
  const out = await liquid.parseAndRender(`{% form 'contact', class: "f" %}<input name="email">{% endform %}`, { request: { path: "/contact", method: "GET" } });
  assert.equal(out, `<form method="post" action="/contact" class="f"><input type="hidden" name="form_type" value="contact"><input name="email"></form>`);
});

test("form: handler gets posted values; success and errors reach the body", async () => {
  const seen: unknown[] = [];
  const ok = setup((s) => (seen.push(s), { ok: true }));
  const tpl = `{% form 'contact' %}{% if form.posted_successfully? %}THANKS{% endif %}{% for e in form.errors %}[{{ e.message }}]{% endfor %}{{ form.values.email }}{% endform %}`;
  const posted = { path: "/c", method: "POST", form: { form_type: "contact", email: "a@b.co" } };
  assert.match(await ok.parseAndRender(tpl, { request: posted }), /THANKS.*a@b\.co/);
  assert.deepEqual(seen, [{ name: "contact", values: { form_type: "contact", email: "a@b.co" } }]);
  const bad = setup(() => ({ ok: false, errors: [{ field: "email", message: "Enter an email" }] }));
  const out = await bad.parseAndRender(tpl, { request: posted });
  assert.ok(out.includes("[Enter an email]") && !out.includes("THANKS"));
  // another form's post does not trigger this form's handler
  seen.length = 0;
  await ok.parseAndRender(tpl, { request: { ...posted, form: { form_type: "other" } } });
  assert.equal(seen.length, 0);
});

const SCHEMA_SRC = (settings: unknown[]) => `{% schema %}${JSON.stringify({ name: "S", settings })}{% endschema %}`;

test("readSchema: finds the JSON and its range; reports bad JSON", () => {
  const src = `<p></p>\n${SCHEMA_SRC([{ type: "text", id: "a", label: "A" }])}\n`;
  const r = readSchema(src);
  assert.equal(r.schema?.name, "S");
  assert.equal(JSON.parse(src.slice(r.range!.start, r.range!.end)).name, "S");
  assert.equal(readSchema("<p></p>").schema, null);
  assert.match(readSchema("{% schema %}{oops{% endschema %}").errors[0]!, /not valid JSON/);
});

test("validateSchema: required attributes per type", () => {
  const bad = (s: unknown) => validateSchema({ name: "S", settings: [s] } as SectionSchema);
  assert.deepEqual(validateSchema({ name: "S", settings: [{ type: "text", id: "a", label: "A" }, { type: "header", content: "H" }] }), []);
  assert.match(bad({ type: "range", id: "r", label: "R", max: 5 })[0]!, /range needs "min"/);
  assert.match(bad({ type: "select", id: "s", label: "S" })[0]!, /select needs "options"/);
  assert.match(bad({ type: "video_url", id: "v", label: "V" })[0]!, /accept/);
  assert.match(bad({ type: "header" })[0]!, /header needs "content"/);
  assert.match(bad({ type: "color_palette", id: "p", label: "P" })[0]!, /only valid in theme settings/);
  assert.match(bad({ type: "text", id: "t" })[0]!, /"label" is required/);
  assert.match(bad({ type: "nope", id: "t", label: "T" })[0]!, /unknown setting type/);
  assert.match(bad({ type: "product_list", id: "p", label: "P", limit: 60 })[0]!, /at most 50/);
});

test("sectionSettingsFromArgs: defaults, literals, unknown and wrong-typed arguments", () => {
  const schema: SectionSchema = { name: "H", settings: [
    { type: "text", id: "headline", label: "H", default: "Hi" },
    { type: "number", id: "count", label: "C" },
    { type: "checkbox", id: "badge", label: "B" },
  ] };
  const page = `{% section 'hero', headline: "Yo", count: "3", badge: true, ghost: 1 %}`;
  const tag = parseSource(page).children[0] as unknown as TagWithArguments;
  const { values, issues } = sectionSettingsFromArgs(schema, readTagArguments(page, tag));
  assert.deepEqual(values, { headline: "Yo", badge: true });
  assert.deepEqual(issues, [{ rule: "section-setting-type", arg: "count" }, { rule: "section-unknown-setting", arg: "ghost" }]);
});
