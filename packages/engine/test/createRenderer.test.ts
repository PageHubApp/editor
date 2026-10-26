import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer, createRendererFromConfiguration, RenderTimeoutError } from "../src/runtime/createRenderer.ts";
import { defineTag } from "../src/runtime/defineTag.ts";
import { defineFilter } from "../src/runtime/defineFilter.ts";
import { defineDataSource } from "../src/runtime/defineDataSource.ts";
import { BUILTIN_TAGS, BUILTIN_FILTER_DEFS } from "../src/runtime/builtins.ts";
import { renderPage } from "../src/runtime/renderPage.ts";
import { t } from "../src/schema/t.ts";
import { Configuration, ConfigError } from "../src/extensions/extension.ts";
import { parserTagsFacet } from "../src/extensions/facets.ts";
import { tagsFacet } from "../src/runtime/facets.ts";
import { parseSource, allNodes } from "../src/parse/parse.ts";

const shout = defineFilter({ name: "shout", args: [t.string().optional(), t.hash({ times: t.int().optional() })], returns: "string", describe: "Uppercase.", run: (v, args) => String(v).toUpperCase() + "!".repeat(((args.find((a) => Array.isArray(a)) as unknown[] | undefined)?.[1] as number) ?? 1) });
const bold = defineFilter({ name: "bold", args: [], returns: "html", describe: "Bold.", run: (v) => `<b>${String(v)}</b>` });
const newsletter = defineTag({
  name: "newsletter_form", kind: "block", parseLike: "form", args: t.hash({ list: t.string(), cta: t.string().optional() }), describe: "Newsletter signup.",
  async *render(ctx, { args, body }) {
    yield `<form data-list="${ctx.escape(args.list)}">`;
    yield await body!({ cta: args.cta ?? "Join" });
    yield "</form>";
  },
});
const stamp = defineTag({ name: "stamp", kind: "tag", parseLike: "section", args: t.hash({ text: t.string() }), describe: "Stamp.", *render(ctx, { args }) { yield `<i>${ctx.escape(args.text)}|${ctx.escape(ctx.get(["page", "title"]))}</i>`; } });
const verbatim = defineTag({ name: "verbatim", kind: "raw", parseLike: "raw", args: t.hash({}), describe: "Raw text.", *render(ctx, { raw }) { yield ctx.escape(raw); } });

const FILES: Record<string, string> = {
  "pages/a.liquid": `{{ "hi" | shout: times: 2 }}|{% render 'card', n: 1 %}`,
  "partials/card.liquid": `<card>{{ n }}</card>`,
};
const r = (extra: unknown[] = [], files = FILES) => createRenderer({ files: (p) => files[p], extensions: [shout, bold, newsletter, stamp, verbatim, ...extra] });

test("a defined filter renders, args are validated; an unregistered filter is a parse error", async () => {
  assert.equal(await r().render("pages/a.liquid", {}), "HI!!|<card>1</card>");
  const bad = { "pages/x.liquid": `{{ "a" | shout: times: "x" }}`, "pages/y.liquid": `{{ "a" | nope }}`, "pages/z.liquid": `{{ "a" | shout: 1, 2 }}` };
  await assert.rejects(r([], bad).render("pages/x.liquid", {}), /option times/);
  await assert.rejects(r([], bad).render("pages/y.liquid", {}), /undefined filter/);
  await assert.rejects(r([], bad).render("pages/z.liquid", {}), /takes 1 argument/);
});

test("html filters are trusted at the end of a chain, escaped elsewhere", async () => {
  const files = { "p": `{{ "<x>" | bold }}|{{ "<x>" | bold | upcase }}|{{ "<x>" }}` };
  assert.equal(await r([], files).render("p", {}), "<b><x></b>|&lt;B&gt;&lt;X&gt;&lt;/B&gt;|&lt;x&gt;");
});

test("a block tag renders its body with scope, and parses as a block", async () => {
  const files = { "p": `{% newsletter_form list: "a&b" %}<p>{{ cta }} {{ page.title }}</p>{% endnewsletter_form %}` };
  const rr = r([], files);
  assert.equal(await rr.render("p", { page: { title: "T" } }), `<form data-list="a&amp;b"><p>Join T</p></form>`);
  const ast = parseSource(files.p, "strict", { env: rr.parserEnvironment } as never);
  const tag = [...allNodes(ast)].map(([n]) => n as { name?: string; children?: unknown[] }).find((n) => n.name === "newsletter_form");
  assert.ok(tag && Array.isArray(tag.children) && tag.children.length > 0, "block with children");
});

test("tag arguments are checked; tag and raw kinds", async () => {
  const f = { a: `{% stamp text: "x" %}`, b: `{% stamp %}`, c: `{% verbatim %}<b>{{ not_rendered }}</b>{% endverbatim %}` };
  assert.equal(await r([], f).render("a", { page: { title: "P" } }), "<i>x|P</i>");
  await assert.rejects(r([], f).render("b", {}), /tag "stamp": text: required/);
  assert.equal(await r([], f).render("c", {}), "&lt;b&gt;{{ not_rendered }}&lt;/b&gt;");
});

test("partials come from files; overrides replace the entry, sections and partials for one render only", async () => {
  const files = { ...FILES, "sections/s.liquid": `S-orig`, "pages/b.liquid": `{% section 's' %}|{% render 'card', n: 2 %}` };
  const rr = r([], files);
  assert.equal(await rr.render("pages/b.liquid", {}), "S-orig|<card>2</card>");
  const out = await rr.render("pages/b.liquid", {}, { overrides: { "sections/s.liquid": "S-new", "partials/card.liquid": "<c2>{{ n }}</c2>" } });
  assert.equal(out, "S-new|<c2>2</c2>");
  assert.equal((await rr.render("pages/b.liquid", {}, { overrides: { "pages/b.liquid": "entry" } })), "entry");
  assert.equal(await rr.render("pages/b.liquid", {}), "S-orig|<card>2</card>");
  assert.equal(rr.readFile("sections/s.liquid"), "S-orig");
});

test("concurrent renders with different overrides do not mix", async () => {
  const rr = r([], { "p": `{% render 'x' %}`, "partials/x.liquid": "base" });
  const outs = await Promise.all(["a", "b", "c", "d"].map((v) => rr.render("p", {}, { overrides: { "partials/x.liquid": v } })));
  assert.deepEqual(outs, ["a", "b", "c", "d"]);
});

test("timeout rejects with RenderTimeoutError (loop and a hanging host call)", async () => {
  const slow = defineTag({ name: "hang", kind: "tag", parseLike: "section", args: t.hash({}), describe: "x", async *render() { await new Promise(() => {}); yield ""; } });
  const files = { loop: `{% for i in (1..100000) %}{% for j in (1..100000) %}{{ i }}{% endfor %}{% endfor %}`, hang: `{% hang %}` };
  const rr = r([slow], files);
  await assert.rejects(rr.render("loop", {}, { timeoutMs: 30 }), RenderTimeoutError);
  await assert.rejects(rr.render("hang", {}, { timeoutMs: 30 }), RenderTimeoutError);
});

test("escape is on, unknown properties are empty, removed tags fail", async () => {
  const rr = r([], { a: `{{ x }}|{{ x.constructor }}`, b: `{% include 'x' %}` });
  assert.equal(await rr.render("a", { x: "<&>" }), "&lt;&amp;&gt;|");
  await assert.rejects(rr.render("b", {}));
});

test("built-ins are defined values; map renders [data-map] and parses as a block", async () => {
  assert.deepEqual(BUILTIN_TAGS.map((x) => x.name).sort(), ["doc", "form", "javascript", "map", "paginate", "schema", "section", "style"]);
  assert.ok(BUILTIN_FILTER_DEFS.some((f) => f.name === "money" && f.returns === "string"));
  const files = { p: `{% map lat: 33.8, lng: -118.3, zoom: 13 %}<address data-pin="1,2"><strong>A</strong></address>{% endmap %}{{ 4999 | money }}` };
  const rr = r([], files);
  assert.equal(await rr.render("p", {}), `<div data-map="{&quot;lat&quot;:33.8,&quot;lng&quot;:-118.3,&quot;zoom&quot;:13}"><address data-pin="1,2"><strong>A</strong></address></div>$49.99`);
  assert.equal(rr.tags.get("map")!.args.check({ lat: 1, lng: 2 }).ok, true);
  assert.equal(rr.tags.get("map")!.args.check({ lat: 100, lng: 2 }).ok, false);
});

test("host-backed filters register only with their provider; form posts need a handler", async () => {
  const none = createRenderer({ files: (p) => ({ p: `{{ 'a' | file_url }}` })[p] });
  await assert.rejects(none.render("p", {}), /file_url/);
  const some = createRenderer({ files: (p) => ({ p: `{{ 'a.pdf' | file_url }}` })[p], host: { fileUrl: (n) => `/f/${n}` } });
  assert.equal(await some.render("p", {}), "/f/a.pdf");
  const form = createRenderer({ files: () => `{% form 'c' %}{{ form.errors[0].message }}{% endform %}` });
  assert.match(await form.render("p", { request: { method: "POST", path: "/", form: { form_type: "c" } } }), /not set up/);
});

test("collisions with built-ins, core tags or each other are config errors", () => {
  assert.throws(() => r([defineTag({ ...stamp, name: "section" } as never)]), ConfigError);
  assert.throws(() => r([defineFilter({ name: "money", args: [], returns: "string", describe: "", run: () => "" })]), /already defined/);
  assert.throws(() => r([defineFilter({ name: "upcase", args: [], returns: "string", describe: "", run: () => "" })]), /already defined/);
  assert.throws(() => createRenderer({ files: () => "", extensions: [shout, shout] }), /already defined/);
  assert.throws(() => createRenderer({ files: () => "", extensions: ["nope"] }), /not a runtime extension/);
});

test("data sources: plain JSON enforced on every call, ttl cache, reserved globals", async () => {
  let calls = 0;
  const ok = defineDataSource({ name: "posts", liquid: { global: "posts", lazy: true }, cache: { ttl: 1000 }, async query() { calls++; return [{ t: "x" }]; } });
  const bad = defineDataSource({ name: "bad", liquid: { global: "bad" }, async query() { return { fn: () => 1 } as never; } });
  const rr = createRenderer({ files: (p) => ({ a: `{% for p in posts %}{{ p.t }}{% endfor %}` })[p], extensions: [ok] });
  const page = { path: "a", url: "/", source: "{% for p in posts %}{{ p.t }}{% endfor %}" };
  const site = { name: "s" };
  const out1 = await renderPage(rr, page, { path: "/" }, { dataSources: [...rr.dataSources.values()], site });
  await renderPage(rr, page, { path: "/" }, { dataSources: [ok], site });
  assert.equal(out1.html, "x");
  assert.equal(calls, 1);
  assert.equal(rr.dataSources.get("posts"), ok);
  await assert.rejects(bad.query({ request: { path: "/" }, page: {} }, { site, request: { path: "/" }, mode: "publish" }), /is not JSON/);
  assert.throws(() => defineDataSource({ name: "x", liquid: { global: "site" }, query: async () => null }), /built-in/);
  assert.throws(() => createRenderer({ files: () => "", extensions: [ok, defineDataSource({ name: "o", liquid: { global: "posts" }, query: async () => null })] }), /both define/);
});

test("renderPage runs on createRenderer; a page without runtime attributes emits no script", async () => {
  const files = { "pages/i.liquid": `<html><head></head><body><a href="/">Home</a>{% section 'h' %}</body></html>`, "sections/h.liquid": `<h1 data-edit-id="z">H</h1>` };
  const rr = createRenderer({ files: (p) => files[p as keyof typeof files] });
  const page = { path: "pages/i.liquid", url: "/", source: files["pages/i.liquid"] };
  const out = await renderPage(rr, page, { path: "/" }, { dataSources: [], site: {} });
  assert.ok(!out.html.includes("<script"));
  assert.ok(out.html.includes(`aria-current="page"`) && !out.html.includes("data-edit-"));
  const withToggle = { ...page, source: files["pages/i.liquid"].replace("Home", `<button data-theme-toggle>t</button>`) };
  const rr2 = createRenderer({ files: (p) => (p === page.path ? withToggle.source : files[p as keyof typeof files]) });
  assert.match((await renderPage(rr2, withToggle, { path: "/" }, { dataSources: [], site: {} })).html, /<script/);
});

test("renderer from a configuration: facets and the plugin's lazy runtime half", async () => {
  const config = Configuration.resolve([stamp, shout, parserTagsFacet.of({ name: "other", parseLike: "form" })]);
  assert.ok(config.facet(tagsFacet).has("stamp"));
  const rr = await createRendererFromConfiguration(config, { files: (p) => ({ p: `{% stamp text: "a" %}{{ "q" | shout }}` })[p] });
  assert.equal(await rr.render("p", { page: { title: "T" } }), "<i>a|T</i>Q!");
});
