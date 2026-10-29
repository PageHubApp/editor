import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/runtime/createRenderer.ts";
import type { DataSourceDef } from "../src/runtime/defineDataSource.ts";
import { renderPage, assertPlainJson, type PageRecord, type SiteJson } from "../src/runtime/renderPage.ts";
import { stampAriaCurrent } from "../src/runtime/pageHtml.ts";

const FILES: Record<string, string> = {
  "pages/index.liquid": `<html><head><title>{{ page.title }}</title></head><body data-edit-id="abc123">
<nav><a href="/">Home</a> <a href="/about/?x=1">About</a> <a href="/other" aria-current="false">Other</a> <a href="https://x.test/about">Ext</a></nav>
{% section 'hero', headline: "Hi" %}<p data-editable="text" data-edit-name="intro">Body</p>
</body></html>`,
  "pages/about.liquid": `<main><h1>About</h1><a href="/about">Self</a>{{ request.params.slug }}|{% if request.design_mode %}DESIGN{% endif %}|{{ routes.about }}|{% for p in pages %}{{ p.url }},{% endfor %}</main>`,
  "pages/shop.liquid": `<body>{{ products.size }}-{{ customer.name }}<button data-theme-toggle>t</button><div data-dismiss="promo"><button data-dismiss-close>x</button></div></body>`,
  "sections/hero.liquid": `<section data-edit-block="hero-split" data-edit-lock="drag"><h1>{{ section.settings.headline }}</h1></section>
{% schema %}{"name":"Hero","settings":[{"type":"text","id":"headline","label":"H","default":"D"}]}{% endschema %}`,
};
const SITE: SiteJson = { name: "S", pages: [{ path: "pages/index.liquid", url: "/", title: "Home" }, { path: "pages/about.liquid", url: "/about", title: "About" }], routes: { about: "/about" } };

const renderer = () => createRenderer({ files: (p) => FILES[p], formHandler: () => ({ ok: true }) });
const rec = (path: string, url: string): PageRecord => ({ path, url, title: path, source: FILES[path]! });
const base = { site: SITE, dataSources: [] as DataSourceDef[] };

test("two-page bundle: each page renders with its own request; the section's file is used", async () => {
  const home = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, base);
  assert.match(home.html, /<h1>Hi<\/h1>/);
  assert.match(home.html, /<title>pages\/index\.liquid<\/title>/);
  const about = await renderPage(renderer(), rec("pages/about.liquid", "/about"), { path: "/about", params: { slug: "x" } }, base);
  assert.match(about.html, /^<main><h1>About<\/h1>/);
  assert.ok(about.html.includes("|/about|/,/about,"));
});

test("no data-edit- in published output (page and section); data-editable kept unless stripEditable", async () => {
  const out = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, base);
  assert.ok(!out.html.includes("data-edit-"));
  assert.ok(out.html.includes(`data-editable="text"`));
  const stripped = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, { ...base, stripEditable: true });
  assert.ok(!stripped.html.includes("data-edit"));
  assert.match(stripped.html, /<p>Body<\/p>/);
  const editor = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, { ...base, mode: "editor" });
  assert.ok(editor.html.includes(`data-edit-block="hero-split"`) && editor.html.includes(`data-edit-id="abc123"`));
});

test("design_mode only in editor mode; route params reach the template", async () => {
  const pub = await renderPage(renderer(), rec("pages/about.liquid", "/about"), { path: "/about/foo", params: { slug: "foo" } }, base);
  assert.ok(pub.html.includes("foo|"), pub.html);
  assert.ok(!pub.html.includes("DESIGN"));
  const ed = await renderPage(renderer(), rec("pages/about.liquid", "/about"), { path: "/about" }, { ...base, mode: "editor" });
  assert.ok(ed.html.includes("|DESIGN|"));
});

test("data sources: lazy source untouched when unreferenced; queried in parallel when referenced; visitorDependent", async () => {
  const calls: string[] = [];
  const ds = (name: string, global: string, extra: Partial<DataSourceDef> = {}): DataSourceDef => ({
    name, liquid: { global, lazy: true }, query: async () => (calls.push(name), name === "customer" ? { name: "Ana" } : [1, 2, 3]), ...extra,
  });
  const sources = [ds("products", "products"), ds("customer", "customer", { visitorDependent: true }), ds("unused", "unused")];
  const shop = await renderPage(renderer(), { path: "pages/shop.liquid", url: "/shop", source: FILES["pages/shop.liquid"]! }, { path: "/shop" }, { ...base, dataSources: sources });
  assert.deepEqual(calls.sort(), ["customer", "products"]);
  assert.ok(shop.html.includes("3-Ana"));
  assert.equal(shop.visitorDependent, true);
  assert.deepEqual(shop.objects, ["products", "customer"]);
  calls.length = 0;
  const home = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, { ...base, dataSources: sources });
  assert.deepEqual(calls, []);
  assert.equal(home.visitorDependent, false);
  // a non-lazy source always runs
  await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, { ...base, dataSources: [{ ...ds("eager", "eager"), liquid: { global: "eager" } }] });
  assert.deepEqual(calls, ["eager"]);
});

test("data sources: non-JSON results and built-in name collisions throw", async () => {
  const bad: DataSourceDef = { name: "bad", liquid: { global: "bad" }, query: async () => ({ at: new Date() }) as never };
  await assert.rejects(renderPage(renderer(), rec("pages/about.liquid", "/about"), { path: "/about" }, { ...base, dataSources: [bad] }), /not plain JSON/);
  const clash: DataSourceDef = { name: "c", liquid: { global: "site" }, query: async () => 1 };
  await assert.rejects(renderPage(renderer(), rec("pages/about.liquid", "/about"), { path: "/about" }, { ...base, dataSources: [clash] }), /replace the built-in/);
  assert.throws(() => assertPlainJson({ f() {} }, "x"), /function is not JSON/);
});

test("aria-current goes on the matching link only", async () => {
  const home = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/" }, base);
  assert.equal((home.html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(home.html, /<a aria-current="page" href="\/">Home<\/a>/);
  const about = await renderPage(renderer(), rec("pages/index.liquid", "/"), { path: "/about" }, base);
  assert.match(about.html, /<a aria-current="page" href="\/about\/\?x=1">About<\/a>/);
  assert.match(about.html, /<a href="\/">Home<\/a>/);
  assert.match(about.html, /<a href="https:\/\/x\.test\/about">Ext<\/a>/); // external: untouched
  assert.match(about.html, /aria-current="false">Other/); // an author's own value is respected
});

test("stampAriaCurrent: skips comments, script bodies and unterminated tags; handles quotes", () => {
  const html = `<!-- <a href="/x">c</a> --><script>var s='<a href="/x">'</script><a data-x="a>b" href='/x'>y</a><abbr href="/x">no</abbr><a href="/x`;
  assert.equal(stampAriaCurrent(html, "/x"), html.replace(`<a data-x`, `<a aria-current="page" data-x`));
  assert.equal(stampAriaCurrent(`<a href="/a/">a</a>`, "/a"), `<a aria-current="page" href="/a/">a</a>`);
});

test("aria-current scan stays fast on a 5k-line page", () => {
  const html = Array.from({ length: 5000 }, (_, i) => `<div class="row"><a href="/p/${i}">Item ${i}</a></div>`).join("\n");
  const t = performance.now();
  const out = stampAriaCurrent(html, "/p/4999");
  // Guards against quadratic blow-up, not micro-timing: linear is ~5 ms, quadratic would be seconds.
  assert.ok(performance.now() - t < 500, `${performance.now() - t}ms`);
  assert.equal((out.match(/aria-current/g) ?? []).length, 1);
});

test("head snippets: theme toggle and dismiss add nonce'd scripts before </head>; none otherwise; editor mode never", async () => {
  const src = (head: string) => ({ path: "pages/t.liquid", url: "/t", source: `<html><head>${head}</head><body><button data-theme-toggle>t</button><div data-dismiss="promo"><i data-dismiss-close></i></div></body></html>` });
  const withBoth = src("<title>t</title>");
  FILES["pages/t.liquid"] = withBoth.source;
  const out = await renderPage(renderer(), withBoth, { path: "/t" }, { ...base, nonce: "abc123==" });
  const scripts = out.html.match(/<script nonce="abc123==">/g) ?? [];
  assert.equal(scripts.length, 2);
  assert.ok(out.html.indexOf("<script") < out.html.indexOf("</head>"));
  const plain = await renderPage(renderer(), rec("pages/about.liquid", "/about"), { path: "/zzz" }, { ...base, nonce: "n" });
  assert.ok(!plain.html.includes("<script"));
  const ed = await renderPage(renderer(), withBoth, { path: "/t" }, { ...base, mode: "editor", nonce: "n" });
  assert.ok(!ed.html.includes("<script"));
  await assert.rejects(renderPage(renderer(), withBoth, { path: "/t" }, { ...base, nonce: `"><script>` }), /invalid CSP nonce/);
  // a dismiss-close child alone does not count as a dismiss band
  FILES["pages/u.liquid"] = `<head></head><i data-dismiss-close></i>`;
  const u = await renderPage(renderer(), { path: "pages/u.liquid", url: "/u", source: FILES["pages/u.liquid"] }, { path: "/u" }, base);
  assert.ok(!u.html.includes("<script"));
});

test("publish strip parses with the renderer's tags: data-edit-* next to and inside a {% map %} block renders", async () => {
  const source = `<section data-edit-name="offices"><div data-edit-name="map">{% map lat: 34, lng: -118, zoom: 14, tiles: 'osm' %}<address data-pin="34,-118" data-edit-id="pin111">HQ</address>{% endmap %}</div></section>`;
  const out = await renderPage(renderer(), { path: "pages/map.liquid", url: "/map", source }, { path: "/map" }, base);
  assert.ok(!out.html.includes("data-edit-"));
  assert.match(out.html, /data-map/);
});
