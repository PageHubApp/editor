import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonDataSources, renderPreview } from "../src/preview.ts";
import { engine, tempSite } from "./helpers.ts";

const PAGES = JSON.stringify([
  { path: "index.liquid", url: "/", title: "Home" },
  { path: "item.liquid", url: "/things/:slug", title: "Thing" },
  { path: "missing.liquid", url: "/404", title: "Not found", policy: { is404: true } },
]);

const site = () =>
  tempSite({
    "pages.json": PAGES,
    "site.json": JSON.stringify({ name: "Test site", lang: "en" }),
    "data.json": JSON.stringify({ company: { name: "Acme" }, request: { params: { slug: "preview" } } }),
    "index.liquid": `<h1>{{ company.name }}</h1><a href="/things/x">x</a>`,
    "item.liquid": `<h1>{{ request.params.slug }}</h1><button command="show-popover" commandfor="m">open</button><div id="m" popover class="hidden">m</div>`,
    "missing.liquid": `<p>gone</p>`,
  });

const opts = { runtimeSrc: "/__runtime.js" };

test("jsonDataSources skips the built-in objects", () => {
  const names = jsonDataSources(engine, { site: {}, request: {}, company: {}, year: 2026 }).map((d) => d.name);
  assert.deepEqual(names, ["company", "year"]);
});

// The layout `pagehub pull` writes: pages under pages/, partials under partials/, company and variables in site.json.
const hosted = () =>
  tempSite({
    "site.json": JSON.stringify({ name: "Hosted", company: { name: "Acme" }, variables: { promo: "LAB10" } }),
    "pages/index.liquid": `{% render 'header' %}<h1>{{ company.name }} {{ variables.promo }}</h1>`,
    "pages/shop/[handle].liquid": `<p>{{ request.params.handle }}</p>`,
    "pages/docs/intro.liquid": `<p>intro</p>`,
    "pages/not-found.liquid": `<p>gone</p>`,
    "partials/header.liquid": `<header>menu</header>`,
  });

test("a pulled hosted site renders with no pages.json: routes come from the files, company and variables from site.json", async () => {
  const dir = hosted();
  const home = await renderPreview(engine, { siteDir: dir, reqPath: "/", ...opts });
  assert.equal(home.status, 200);
  assert.match(home.html, /<header>menu<\/header><h1>Acme LAB10<\/h1>/);
  assert.match((await renderPreview(engine, { siteDir: dir, reqPath: "/shop/mug", ...opts })).html, /<p>mug<\/p>/);
  assert.match((await renderPreview(engine, { siteDir: dir, reqPath: "/docs/intro", ...opts })).html, /<p>intro<\/p>/);
  const miss = await renderPreview(engine, { siteDir: dir, reqPath: "/nowhere", ...opts });
  assert.equal(miss.status, 404);
  assert.match(miss.html, /<p>gone<\/p>/);
});

test("data.json still wins over site.json's company", async () => {
  const dir = tempSite({ "site.json": JSON.stringify({ company: { name: "FromSite" } }), "data.json": JSON.stringify({ company: { name: "FromData" } }), "pages/index.liquid": `<h1>{{ company.name }}</h1>` });
  assert.match((await renderPreview(engine, { siteDir: dir, reqPath: "/", ...opts })).html, /<h1>FromData<\/h1>/);
});

test("a page that uses nothing the runtime handles ships no runtime", async () => {
  const { status, html } = await renderPreview(engine, { siteDir: site(), reqPath: "/", ...opts });
  assert.equal(status, 200);
  assert.match(html, /<h1>Acme<\/h1>/);
  assert.doesNotMatch(html, /__runtime\.js/);
});

test("a page that uses it gets the runtime script", async () => {
  const { html } = await renderPreview(engine, { siteDir: site(), reqPath: "/things/widget", ...opts });
  assert.match(html, /<h1>widget<\/h1>/);
  assert.match(html, /<script type="module" src="\/__runtime\.js">/);
});

test("a route capture reaches the page as request.params", async () => {
  const dir = site();
  const { html } = await renderPreview(engine, { siteDir: dir, reqPath: "/things/y", ...opts });
  assert.match(html, /<h1>y<\/h1>/);
});

test("internal links stay under the preview prefix", async () => {
  const { html } = await renderPreview(engine, { siteDir: site(), reqPath: "/", viewBase: "/~view/s", ...opts });
  assert.match(html, /href="\/~view\/s\/things\/x"/);
});

test("an unknown route renders the site's 404 page at 404", async () => {
  const { status, html } = await renderPreview(engine, { siteDir: site(), reqPath: "/nope", ...opts });
  assert.equal(status, 404);
  assert.match(html, /gone/);
});
