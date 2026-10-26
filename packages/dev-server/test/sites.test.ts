import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSites, pagesFromFiles, sitePages } from "../src/sites.ts";
import { localHost } from "../src/localHost.ts";
import { tempSite } from "./helpers.ts";

test("sites under a root are listed by label and resolved by id, never by traversal", async () => {
  const root = tempSite({ "alpha/index.liquid": "a", "alpha/data.json": JSON.stringify({ company: { name: "Zed Co" } }), "beta/index.liquid": "b", "notasite/readme.txt": "x" });
  mkdirSync(join(root, "gamma"));
  const sites = createSites({ sitesRoot: root });
  assert.deepEqual((await sites.listSites()).map((s) => s.label), ["beta", "Zed Co"]);
  assert.equal((await sites.resolveSite("beta"))?.id, "beta");
  assert.equal(await sites.resolveSite("../x"), null);
  assert.equal(await sites.resolveSite("notasite"), null);
  assert.equal(await sites.resolveSite("gamma"), null);
  writeFileSync(join(root, "gamma", "p.html"), "x");
  assert.equal((await sites.resolveSite("gamma"))?.id, "gamma");
});

test("pagesFromFiles reads routes from the hosted layout: index is home, [x] is a capture, not-found is the 404", () => {
  assert.deepEqual(pagesFromFiles(["pages/index.liquid", "pages/about.liquid", "pages/shop/[handle].liquid", "pages/not-found.liquid", "partials/header.liquid", "pages/notes.txt"]), [
    { path: "pages/about.liquid", url: "/about" },
    { path: "pages/index.liquid", url: "/", policy: { isHome: true } },
    { path: "pages/not-found.liquid", url: "/not-found", policy: { is404: true } },
    { path: "pages/shop/[handle].liquid", url: "/shop/:handle" },
  ]);
});

test("pages.json and site.json pages still win over the hosted layout", () => {
  const read = (p: string) => ({ "pages.json": JSON.stringify([{ path: "x.liquid", url: "/x" }]) })[p];
  assert.deepEqual(sitePages(read, () => ["pages/index.liquid"]), [{ path: "x.liquid", url: "/x" }]);
  assert.deepEqual(sitePages(() => undefined), []);
});

test("no id resolves to the opened folder", async () => {
  const dir = tempSite({ "index.liquid": "a" });
  assert.equal((await createSites({ dir }).resolveSite(null))?.dir, dir);
});

test("localHost: ids resolve against the site's CDN base; an empty one is the caller's placeholder", () => {
  const h = localHost({ site: { imageBase: "https://cdn.test", imageVariant: "hero" }, icons: { "ref:a": "<svg/>" } }, { emptyImage: "PLACEHOLDER" });
  assert.equal(h.imageUrl("abc"), "https://cdn.test/abc/hero");
  assert.equal(h.imageUrl("https://x.test/a.png"), "https://x.test/a.png");
  assert.equal(h.imageUrl("  "), "PLACEHOLDER");
  assert.equal(h.fileUrl("file-id"), "#");
  assert.equal(h.icon("ref:a"), "<svg/>");
  assert.equal(localHost({ site: {}, icons: {} }).imageUrl("abc"), "");
});
