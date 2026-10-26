import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRoute, normalizeRoutePath } from "../src/render";

const pages = [
  { url: "/", title: "home" },
  { url: "/about", title: "about" },
  { url: "/plants/featured", title: "featured" },
  { url: "/plants/:slug", title: "plant" },
  { url: "/blog/:year/:slug", title: "post" },
  { title: "no url" },
];

test("normalizeRoutePath: slashes, query and hash", () => {
  assert.equal(normalizeRoutePath(""), "/");
  assert.equal(normalizeRoutePath("/"), "/");
  assert.equal(normalizeRoutePath("about/"), "/about");
  assert.equal(normalizeRoutePath("//a//"), "/a");
  assert.equal(normalizeRoutePath("/a/b?x=1#y"), "/a/b");
});

test("exact urls match, with trailing slash, query and hash ignored", () => {
  assert.equal(matchRoute(pages, "/")?.page.title, "home");
  assert.equal(matchRoute(pages, "/about/")?.page.title, "about");
  assert.equal(matchRoute(pages, "/about?x=1")?.page.title, "about");
  assert.deepEqual(matchRoute(pages, "/about")?.params, {});
});

test("an exact url beats a pattern that would also fit", () => {
  assert.equal(matchRoute(pages, "/plants/featured")?.page.title, "featured");
});

test("pattern captures become params, URL-decoded", () => {
  const m = matchRoute(pages, "/plants/monstera-deliciosa");
  assert.equal(m?.page.title, "plant");
  assert.deepEqual(m?.params, { slug: "monstera-deliciosa" });
  assert.deepEqual(matchRoute(pages, "/blog/2026/a%20b")?.params, { year: "2026", slug: "a b" });
});

test("a capture is exactly one non-empty segment", () => {
  assert.equal(matchRoute(pages, "/plants"), null);
  assert.equal(matchRoute(pages, "/plants/a/b"), null);
  assert.equal(matchRoute(pages, "/blog/2026"), null);
});

test("no match and bad escapes return null", () => {
  assert.equal(matchRoute(pages, "/nope"), null);
  assert.equal(matchRoute(pages, "/plants/%E0%A4%A"), null);
  assert.equal(matchRoute([], "/"), null);
});

test("regex characters in a route are literal", () => {
  const p = [{ url: "/a.b/:x" }];
  assert.equal(matchRoute(p, "/axb/1"), null);
  assert.deepEqual(matchRoute(p, "/a.b/1")?.params, { x: "1" });
});

test("the first fitting pattern wins", () => {
  const p = [{ url: "/:a/x", n: 1 }, { url: "/:b/:c", n: 2 }];
  assert.equal(matchRoute(p, "/q/x")?.page.n, 1);
});
