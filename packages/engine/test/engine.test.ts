import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createEngine } from "../src/liquid/engine.ts";
import { SAMPLE } from "./helpers.ts";
import { TestFormTag } from "./formTag.ts";

// Test-only fills for the host plug-in filters the sample uses.
const filters = {
  image_url: (src: unknown, ...args: unknown[]) => {
    const opts = Object.fromEntries(args.filter(Array.isArray) as Array<[string, unknown]>);
    return src ? `https://cdn.example/${String(src)}/w=${String(opts.width ?? "public")}` : "";
  },
  money: (cents: unknown) => (cents == null ? "" : `$${(Number(cents) / 100).toFixed(2)}`),
  icon: (ref: unknown) => `<svg data-icon="${String(ref)}" aria-hidden="true"></svg>`,
};
const partials = { header: `<header class="site-header"><a href="/">{{ site.name }}</a></header>` };
const DATA = {
  site: { name: "Moss & Fern Painting", city: "Torrance", founded: 2009 },
  customer: null,
  collections: {
    services: [
      { title: "Interior painting", summary: "Walls, trim, ceilings.", image: "img-int", price: 45000 },
      { title: "Exterior painting", summary: "Siding & stucco.", image: "img-ext", price: 120000 },
      { title: "Cabinet refinishing", summary: "Kitchens & baths.", image: "img-cab", price: 80000 },
    ],
  },
  product: { title: "Deck stain kit", price: 4999 },
  blog: { articles: Array.from({ length: 12 }, (_, i) => ({ title: `Post ${i + 1}`, url: `/blog/p${i + 1}`, published_at: `2026-0${(i % 9) + 1}-15` })) },
  request: { path: "/", query: { page: "2", sort: "new" } },
};

const engine = createEngine({ partials, filters, tags: { form: TestFormTag } });

test("render: the sample page with partials, loops, branches, filters and paginate", async () => {
  const html = await engine.parseAndRender(SAMPLE, DATA);
  assert.ok(html.includes(`<header class="site-header"><a href="/">Moss &amp; Fern Painting</a></header>`));
  assert.equal(html.match(/<article class="card bg-base-200/g)?.length, 3);
  assert.ok(html.includes("https://cdn.example/img-int/w=800"));
  assert.ok(html.includes("From $450.00") && html.includes("$49.99"));
  assert.ok(html.includes(`href="/login"`) && !html.includes(`href="/account"`));
  assert.ok(html.includes("Page 2 of 3") && html.includes(">Post 6<") && !html.includes(">Post 5<"));
  assert.ok(html.includes(`href="/?sort=new&amp;page=1"`) && html.includes(`href="/?sort=new&amp;page=3"`));
  assert.ok(html.includes(`commandfor="quote-modal" command="show-modal"`));
  assert.ok(html.includes(`<form method="post" action="/forms/leads" class="grid gap-space-sm">`));
});

test("render: for…else empty state and the logged-in branch", async () => {
  assert.ok((await engine.parseAndRender(SAMPLE, { ...DATA, collections: { services: [] } })).includes("No services yet"));
  assert.ok((await engine.parseAndRender(SAMPLE, { ...DATA, customer: { first_name: "Ana" } })).includes("Hi, Ana"));
});

test("render: output is escaped by default; HTML filters need | raw", async () => {
  const evil = { t: "<img src=x onerror=alert(1)>" };
  const out = await engine.parseAndRender(`<h3>{{ t }}</h3><a title="{{ t }}">`, evil);
  assert.ok(!out.includes("<img"));
  assert.ok(out.includes("&lt;img src=x onerror=alert(1)&gt;"));
  const icon = await engine.parseAndRender(`{{ 'tb/TbSend' | icon }}|{{ 'tb/TbSend' | icon | raw }}`, {});
  assert.ok(icon.startsWith("&lt;svg") && icon.includes("|<svg data-icon"));
});

test("render: | escape is applied once, not escaped again by the output escaping", async () => {
  assert.equal(await engine.parseAndRender(`{{ t | escape }}`, { t: "a & <b>" }), "a &amp; &lt;b&gt;");
  assert.equal(await engine.parseAndRender(`{{ t }}`, { t: "a & <b>" }), "a &amp; &lt;b&gt;");
});

test("sandbox: prototype tricks render empty; size and first still work", async () => {
  const probes = [
    "{{ x.constructor }}",
    "{{ x.__proto__ }}",
    "{{ s.constructor }}",
    "{{ x.constructor.constructor }}",
    "{{ x.hasOwnProperty }}",
    `{{ arr | map: "constructor" | join: "," }}`,
    "{{ x['constructor'] }}",
    "{% assign c = x.constructor %}{{ c.name }}{{ c.prototype }}",
    "{{ x.toString }}",
  ];
  for (const t of probes) assert.equal((await engine.parseAndRender(t, { x: { a: 1 }, s: "abc", arr: [{ a: 1 }] })).trim(), "", t);
  assert.equal(await engine.parseAndRender("{{ arr.size }} {{ s.size }} {{ arr.first.a }}", { s: "abc", arr: [{ a: 1 }] }), "1 3 1");
});

test("strictFilters: an unknown filter is a parse error", async () => {
  await assert.rejects(engine.parseAndRender("{{ x | nope }}", {}), /undefined filter: nope/);
});

test("removed tags: include, layout and block are parse errors", async () => {
  for (const t of [`{% include 'header' %}`, `{% layout 'x' %}`, `{% block a %}x{% endblock %}`]) {
    await assert.rejects(engine.parseAndRender(t, {}), /tag .* not found/, t);
  }
});

test("limits: runaway templates stop with an error", async () => {
  const cases: Array<[string, string]> = [
    ["huge range", "{% for i in (1..1000000000) %}{{ i }}{% endfor %}"],
    ["nested loops", "{% for i in (1..10000) %}{% for j in (1..10000) %}.{% endfor %}{% endfor %}"],
    ["string doubling", `{% assign s = "xxxxxxxxxx" %}{% for i in (1..40) %}{% assign s = s | append: s %}{% endfor %}{{ s.size }}`],
    ["template over parseLimit", "x".repeat(1_000_001)],
  ];
  for (const [label, tpl] of cases) await assert.rejects(engine.parseAndRender(tpl, {}), /limit/i, label);
});

test("date: date-only strings do not shift by the server timezone", async () => {
  assert.equal(await engine.parseAndRender(`{{ d | date: "%b %d, %Y" }}`, { d: "2026-06-15" }), "Jun 15, 2026");
});

test("edge-safety: the liquidjs build has no eval or new Function", () => {
  const require = createRequire(import.meta.url);
  const dist = path.dirname(require.resolve("liquidjs"));
  for (const f of ["liquid.node.mjs", "liquid.browser.mjs", "liquid.browser.min.js"]) {
    const src = fs.readFileSync(path.join(dist, f), "utf8");
    assert.ok(!/new Function|\beval\(/.test(src), f);
  }
});
