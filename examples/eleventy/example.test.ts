import { test } from "node:test";
import assert from "node:assert/strict";
import { readSite, openSite, changedLines, errors } from "../_shared/headless.ts";
import { createRendererFromConfiguration } from "@pagehub/engine/render";
import { htmlKit, liquidKit, tailwindKit, inlineText } from "@pagehub/engine/kits";
import { stripEditSrc } from "@pagehub/engine/canvas";
import { collectionsOf, parseFrontMatter, renderEleventyPage, siteData, url } from "./eleventy.ts";

const files = readSite(new URL("./site/src", import.meta.url).pathname);
const open = () => openSite(files, { data: siteData(files), extensions: [htmlKit(), tailwindKit(), liquidKit(), inlineText(), url] });
const render = async (path: string) => {
  const e = open();
  const r = await createRendererFromConfiguration(e.state.config, { files: (p) => e.state.files.get(p) });
  return stripEditSrc(await renderEleventyPage(r, e.state, path, siteData(files)));
};

test("eleventy: pages, layouts and partials parse with no error-level diagnostics", () => {
  assert.deepEqual(errors(open()).map((d) => `${d.path}: ${d.message}`), []);
});

test("eleventy: front matter is read, and the body keeps the file's own text", () => {
  const { data, body } = parseFrontMatter(files["about.liquid"]!);
  assert.deepEqual(data, { layout: "base.liquid", title: "About", permalink: "/about/" });
  assert.ok(body.startsWith('<main class="wrap">'));
});

test("eleventy: collections.post comes from the markdown posts, oldest first", () => {
  const posts = collectionsOf(files).post;
  assert.equal(posts.length, 4);
  assert.deepEqual(posts.map((p) => p.url), ["/blog/spring-plots/", "/blog/tomato-trials/", "/blog/rain-barrels/", "/blog/first-frost/"]);
});

test("eleventy: the listing renders N posts, newest first, inside the layout", async () => {
  const html = await render("blog.liquid");
  assert.match(html, /<title>Garden journal \| Northfield Community Garden<\/title>/);
  assert.equal((html.match(/<article>/g) ?? []).length, 4);
  assert.ok(html.indexOf("Getting ready for the first frost") < html.indexOf("Spring plots are open"));
  assert.match(html, /<time datetime="2026-09-28">September 28, 2026<\/time>/);
  assert.match(html, /class="site-header"/, "the header partial rendered inside the layout");
});

test("eleventy: the home page shows the three latest posts", async () => {
  const html = await render("index.liquid");
  assert.equal((html.match(/<article>/g) ?? []).length, 3);
  assert.ok(!html.includes("Spring plots are open"));
});

test("eleventy: an edit keeps the front matter byte-exact and is a one-line diff", () => {
  const e = open();
  e.select(e.get("h1", "about.liquid"));
  assert.ok(e.run("text.setInner", { target: e.get("h1", "about.liquid"), source: "About our garden" }));
  const after = e.text("about.liquid");
  assert.ok(after.startsWith(files["about.liquid"]!.match(/^---[\s\S]*?---\n/)![0]), "front matter untouched");
  assert.deepEqual(changedLines(files["about.liquid"]!, after), { removed: 1, added: 1 });
});
