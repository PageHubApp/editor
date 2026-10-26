import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.ts";
import { contentMode } from "../src/content/contentMode.ts";
import { checkContentOnly, checkContentChanges } from "../src/content/checkContentOnly.ts";

const P = "pages/index.liquid";
const PAGE = `<section class="hero" data-edit-lock="sealed"><h2 data-editable="text">Locked</h2></section>
<section class="intro">
  <h1 data-editable="text">Welcome</h1>
  <p>Static copy</p>
  <img data-editable="image" class="w-full" src="a.jpg" alt="A">
  <a data-editable="link" class="btn" href="/shop">Shop</a>
  <p data-editable="text">Hi {{ customer.name }}</p>
</section>
{% section 'hero', headline: "Hello", count: 3, show: true %}
`;
const HERO = `<h1>{{ section.settings.headline }}</h1>
{% schema %}
{ "name": "Hero", "settings": [
  { "id": "headline", "type": "text", "label": "Headline" },
  { "id": "count", "type": "number", "label": "Count" },
  { "id": "show", "type": "checkbox", "label": "Show" }
] }
{% endschema %}
`;
const FILES = { [P]: PAGE, "sections/hero.liquid": HERO };

const CASES: Array<[name: string, from: string, to: string, ok: boolean]> = [
  ["text inside data-editable=text", ">Welcome<", ">Hello there<", true],
  ["text outside any editable", "Static copy", "Changed copy", false],
  ["image src", `src="a.jpg"`, `src="b.jpg"`, true],
  ["image class", `class="w-full"`, `class="w-half"`, false],
  ["image alt", `alt="A"`, `alt="A photo"`, true],
  ["link href", `href="/shop"`, `href="/sale"`, true],
  ["link text", ">Shop<", ">Buy now<", true],
  ["javascript: href", `href="/shop"`, `href="javascript:alert(1)"`, false],
  ["section headline value", `headline: "Hello"`, `headline: "Hi there"`, true],
  ["adding a section argument", "show: true %}", "show: true, extra: 1 %}", false],
  ["{% if %} typed into text", ">Welcome<", ">Welcome {% if x %}y{% endif %}<", false],
  ["new output typed into text", ">Welcome<", ">Welcome {{ shop.name }}<", false],
  ["existing output kept", ">Hi {{ customer.name }}<", ">Hey {{ customer.name }}<", true],
  ["inline formatting", ">Welcome<", ">Welcome <strong>all</strong><", true],
  ["markup with handlers in text", ">Welcome<", "><img src=x onerror=alert(1)><", false],
  ["wrong argument type", "count: 3", `count: "three"`, false],
  ["right argument type", "count: 3", "count: 5", true],
  ["variable as argument", `headline: "Hello"`, "headline: product.title", false],
  ["text inside a sealed element", ">Locked<", ">Open<", false],
  ["removing data-editable", `<h1 data-editable="text">`, "<h1>", false],
  ["Liquid in src", `src="a.jpg"`, `src="{{ x }}"`, false],
  ["moving a section", `{% section 'hero', headline: "Hello", count: 3, show: true %}\n`, "", false],
];

const gate = () => createStore({ files: FILES, extensions: [contentMode()] });

for (const [name, from, to, ok] of CASES) {
  test(`content mode: ${name} → ${ok ? "ok" : "vetoed"}`, () => {
    assert.ok(PAGE.includes(from), `fixture lacks ${from}`);
    const next = PAGE.replace(from, to);
    const server = checkContentOnly(PAGE, next, { bundle: { ...FILES, [P]: next } });
    assert.equal(server.ok, ok, server.ok ? "server accepted" : server.reason);
    const s = gate();
    let applied: boolean;
    try {
      applied = s.dispatch((tr) => tr.replace({ path: P, from: PAGE.indexOf(from), to: PAGE.indexOf(from) + from.length }, to).annotate({ origin: "content" }));
    } catch {
      applied = false; // the edit doesn't even parse
    }
    assert.equal(applied, ok, "in-editor gate disagrees with the server check");
    assert.equal(s.state.files.get(P), ok ? next : PAGE);
  });
}

test("content mode: remote edits and selection pass; whole-site check rejects new files", () => {
  const s = gate();
  assert.ok(s.dispatch((tr) => tr.replace({ path: P, from: 0, to: 0 }, "<!-- x -->").annotate({ origin: "remote" })));
  s.select(s.find(P, "h1"));
  assert.equal(s.state.selection.handles.length, 1);
  assert.equal(checkContentChanges(FILES, { ...FILES, "pages/new.liquid": "<p>x</p>" }).ok, false);
  assert.equal(checkContentChanges(FILES, { ...FILES, [P]: PAGE.replace(">Welcome<", ">Hi<") }).ok, true);
});
