import { test } from "node:test";
import assert from "node:assert/strict";
import { readSite, openSite, errors, changedLines } from "../_shared/headless.ts";
import { allNodes, checkContentOnly, readTagArguments, setTagArgument, liquidString, parseSource, NodeTypes, type TagWithArguments } from "@pagehub/engine";
import { renderPage, createRendererFromConfiguration } from "@pagehub/engine/render";
import { htmlKit, tailwindKit, liquidKit, inlineText } from "@pagehub/engine/kits";
import { dataSources, formHandler, host, matchRoute, parseCatalog, resolveSetting, canvasData, mediaLibrary } from "./store.ts";

const files = readSite(new URL("./site", import.meta.url).pathname);
const catalog = parseCatalog(files["catalog.json"]!);
const site = { name: catalog.site.name, currency: catalog.site.currency, email: catalog.site.email };

const open = (role?: "client") => openSite(files, { role, data: canvasData(catalog), extensions: [htmlKit(), tailwindKit(), liquidKit(), inlineText(), dataSources(catalog), mediaLibrary(catalog)] });

/** Publish render of a URL: route → page file → renderPage with the data sources. */
async function visit(url: string, form?: Record<string, string>) {
  const u = new URL(url, "http://x.test");
  const route = matchRoute(u.pathname)!;
  assert.ok(route, `no route for ${url}`);
  const e = open();
  const renderer = await createRendererFromConfiguration(e.state.config, { files: (p) => files[p], host, formHandler, resolveSetting: resolveSetting(catalog) });
  const out = await renderPage(
    renderer,
    { path: route.file, url: u.pathname, source: files[route.file]! },
    { path: u.pathname, query: Object.fromEntries(u.searchParams), params: route.params, method: form ? "POST" : "GET", form },
    { site, dataSources: dataSources(catalog) },
  );
  return out.html;
}

test("liquid-store: every page and the section parse with no error-level diagnostics", () => {
  assert.deepEqual(errors(open()).map((d) => `${d.path}: ${d.message}`), []);
});

test("liquid-store: the home page lists the featured collection and the hero's section arguments", async () => {
  const html = await visit("/");
  assert.match(html, /<h1>Plants for every windowsill<\/h1>/);
  assert.match(html, /class="brand" href="\/">Sprout &amp; Stem<\/a>/, "partials get site passed explicitly");
  assert.equal((html.match(/class="product-card"/g) ?? []).length, 4);
  assert.match(html, /\/assets\/hero\.svg/, "image_url resolves the media id through the host");
  assert.match(html, /<svg[^>]*>.*Cart/s, "icon filter inlines the SVG");
  assert.ok(!html.includes("data-edit-"));
});

test("liquid-store: page 2 of the product list slices the catalog", async () => {
  const p1 = await visit("/products");
  const p2 = await visit("/products?page=2");
  assert.equal((p1.match(/class="product-card"/g) ?? []).length, 6);
  assert.equal((p2.match(/class="product-card"/g) ?? []).length, 4);
  assert.match(p1, /Page 1 of 2/);
  assert.match(p2, /Page 2 of 2/);
  assert.ok(p2.includes("Snake plant") && !p1.includes("Snake plant"));
  const ferns = await visit("/products?category=ferns");
  assert.equal((ferns.match(/class="product-card"/g) ?? []).length, 3);
  assert.match(ferns, /<option value="ferns" selected>/);
});

test("liquid-store: /products/:handle reaches the data source; money and sold-out state render", async () => {
  const html = await visit("/products/monstera");
  assert.match(html, /<h1>Monstera deliciosa<\/h1>/);
  assert.match(html, /\$54\.00/);
  const sold = await visit("/products/maidenhair-fern");
  assert.match(sold, /Sold out/);
  assert.match(sold, /<s>\$38\.00<\/s> \$34\.00/);
});

test("liquid-store: missing section arguments render the schema defaults", async () => {
  const e = open();
  const bare = files["index.liquid"]!.replace(/\{% section 'hero'[^%]*%\}/, "{% section 'hero' %}");
  const renderer = await createRendererFromConfiguration(e.state.config, {
    files: (p) => (p === "index.liquid" ? bare : files[p]),
    host,
  });
  const html = await renderer.render("index.liquid", { site, collections: {}, products: [] });
  assert.match(html, /<h1>Plants for every windowsill<\/h1>/);
  assert.match(html, /<p>Hand-potted houseplants, shipped with care\.<\/p>/);
});

test("liquid-store: the contact form validates, then reports success", async () => {
  const bad = await visit("/contact", { form_type: "contact", name: "Ada", email: "nope" });
  assert.match(bad, /That email address does not look right/);
  const ok = await visit("/contact", { form_type: "contact", name: "Ada", email: "ada@example.com", message: "hi" });
  assert.match(ok, /Thanks, we got your message/);
});

const heroTag = (src: string) =>
  allNodes(parseSource(src)).map(([n]) => n).find((n) => n.type === NodeTypes.LiquidTag && n.name === "section") as unknown as TagWithArguments;

test("liquid-store: a section argument edit changes only that value's bytes", () => {
  const src = files["index.liquid"]!;
  const hero = heroTag(src);
  assert.deepEqual(readTagArguments(src, hero).map((a) => a.name), ["headline", "subhead", "photo", "button", "button_link"]);
  const r = setTagArgument(src, hero, "headline", liquidString("Walk in, walk out with a fern"));
  assert.deepEqual(changedLines(src, r.source), { removed: 1, added: 1 });
});

test("liquid-store: the client role edits data-editable text but cannot restructure", () => {
  const e = open("client");
  const [intro] = e.find("index.liquid", "p[data-editable]");
  assert.ok(intro, "the author marked a paragraph editable");
  e.select(intro);
  assert.ok(e.run("text.setInner", { target: intro, source: "Our four favourites this month." }));
  assert.ok(e.text("index.liquid").includes("Our four favourites this month."));
  // structure is frozen: deleting a section is refused
  const [band] = e.find("index.liquid", "section.band--tint");
  e.select(band!);
  assert.equal(e.can("delete"), false);
});

test("liquid-store: content mode accepts section argument values and refuses moving a section", () => {
  const src = files["index.liquid"]!;
  const edited = setTagArgument(src, heroTag(src), "headline", liquidString("Fresh stock every Friday")).source;
  const bundle = new Map(Object.entries(files));
  assert.equal(checkContentOnly(src, edited, { bundle }).ok, true);
  // swap the two bands: structure changed
  const a = src.indexOf('  <section class="band">');
  const b = src.indexOf('  <section class="band band--tint">');
  const end = src.indexOf("</main>");
  const moved = src.slice(0, a) + src.slice(b, end) + "\n" + src.slice(a, b) + src.slice(end);
  assert.equal(checkContentOnly(src, moved, { bundle }).ok, false);
});
