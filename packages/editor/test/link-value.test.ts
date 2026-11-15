// linkValue: an href ↔ the link picker's tab + field, and the new-tab rel / page anchor helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anchorIds, buildHref, parseHref, relForNewTab, webAddress } from "../src/features/links/linkValue.ts";
import { linkablePages } from "../src/features/topbar/pages.ts";

const ROUTES = ["/", "/about", "/blog"];

describe("parseHref", () => {
  it("reads each kind", () => {
    assert.deepEqual(parseHref(""), { kind: "page", value: "" });
    assert.deepEqual(parseHref(null), { kind: "page", value: "" });
    assert.deepEqual(parseHref("mailto:hi@example.com"), { kind: "email", value: "hi@example.com" });
    assert.deepEqual(parseHref("MAILTO:a%40b.com"), { kind: "email", value: "a@b.com" });
    assert.deepEqual(parseHref("tel:+15551234567"), { kind: "phone", value: "+15551234567" });
    assert.deepEqual(parseHref("https://example.com/x"), { kind: "web", value: "https://example.com/x" });
    assert.deepEqual(parseHref("http://example.com"), { kind: "web", value: "http://example.com" });
    assert.deepEqual(parseHref("//cdn.example.com/a"), { kind: "web", value: "//cdn.example.com/a" });
    assert.deepEqual(parseHref("ftp://x"), { kind: "web", value: "ftp://x" });
  });

  it("a /path is a page when it is one of the site's routes, else a web address", () => {
    assert.deepEqual(parseHref("/about", ROUTES), { kind: "page", value: "/about" });
    assert.deepEqual(parseHref("/about/", ROUTES), { kind: "page", value: "/about" });
    assert.deepEqual(parseHref("/about#team", ROUTES), { kind: "page", value: "/about", anchor: "team" });
    assert.deepEqual(parseHref("/", ROUTES), { kind: "page", value: "/" });
    assert.deepEqual(parseHref("/shop", ROUTES), { kind: "web", value: "/shop" });
    assert.deepEqual(parseHref("/shop"), { kind: "page", value: "/shop" }, "no route list: any path is a page");
  });

  it("a bare #anchor is a section of this page", () => {
    assert.deepEqual(parseHref("#contact", ROUTES), { kind: "page", value: "", anchor: "contact" });
  });

  it("Liquid is shown as-is in the web address field", () => {
    for (const href of ["{{ product.url }}", "/products/{{ product.handle }}", "mailto:{{ shop.email }}", "{% if x %}/a{% endif %}"]) assert.deepEqual(parseHref(href, ROUTES), { kind: "web", value: href });
  });
});

describe("buildHref", () => {
  it("builds each kind back", () => {
    assert.equal(buildHref({ kind: "page", value: "/about" }), "/about");
    assert.equal(buildHref({ kind: "page", value: "/about", anchor: "team" }), "/about#team");
    assert.equal(buildHref({ kind: "page", value: "", anchor: "top" }), "#top");
    assert.equal(buildHref({ kind: "page", value: "" }), "");
    assert.equal(buildHref({ kind: "email", value: " hi@example.com " }), "mailto:hi@example.com");
    assert.equal(buildHref({ kind: "email", value: "mailto:hi@example.com" }), "mailto:hi@example.com");
    assert.equal(buildHref({ kind: "email", value: "" }), "");
    assert.equal(buildHref({ kind: "phone", value: "+1 555-123 4567" }), "tel:+15551234567");
    assert.equal(buildHref({ kind: "phone", value: "(555) 123.4567" }), "tel:5551234567");
    assert.equal(buildHref({ kind: "phone", value: "  " }), "");
    assert.equal(buildHref({ kind: "web", value: "" }), "");
  });

  it("adds https:// to a bare domain only", () => {
    assert.equal(webAddress("example.com"), "https://example.com");
    assert.equal(webAddress("www.example.co.uk/path?q=1"), "https://www.example.co.uk/path?q=1");
    assert.equal(webAddress("https://example.com"), "https://example.com");
    assert.equal(webAddress("/shop"), "/shop");
    assert.equal(webAddress("#top"), "#top");
    assert.equal(webAddress("?page=2"), "?page=2");
    assert.equal(webAddress("mailto:x@y.com"), "mailto:x@y.com");
    assert.equal(webAddress("hello"), "hello", "no dot: left as typed");
    assert.equal(webAddress("a@b.com"), "a@b.com", "an email typed into web is not made a URL");
    assert.equal(webAddress("{{ product.url }}"), "{{ product.url }}");
    assert.equal(webAddress("example.com/{{ x }}"), "example.com/{{ x }}", "Liquid is never mangled");
  });

  it("round-trips", () => {
    for (const href of ["/about", "/about#team", "#top", "mailto:hi@example.com", "tel:+15551234567", "https://example.com", "{{ x.url }}"]) assert.equal(buildHref(parseHref(href, ROUTES)), href, href);
  });
});

describe("relForNewTab", () => {
  it("adds and drops noopener noreferrer, keeping other tokens", () => {
    assert.equal(relForNewTab(null, true), "noopener noreferrer");
    assert.equal(relForNewTab("nofollow", true), "nofollow noopener noreferrer");
    assert.equal(relForNewTab("noopener nofollow", true), "nofollow noopener noreferrer");
    assert.equal(relForNewTab("noopener noreferrer", false), null);
    assert.equal(relForNewTab("nofollow noopener noreferrer", false), "nofollow");
    assert.equal(relForNewTab(undefined, false), null);
  });
});

describe("anchorIds / linkablePages", () => {
  it("lists the literal ids on a page", () => {
    assert.deepEqual(anchorIds(`<section id="hero"></section><div id='team'></div><p id="{{ x }}"></p><a id="hero"></a><div data-id="no"></div>`), ["hero", "team"]);
    assert.deepEqual(anchorIds(undefined), []);
  });

  it("lists pages Home first by name, without :param detail pages", () => {
    const files = ["pages/about.liquid", "pages/index.liquid", "pages/products/[handle].liquid", "partials/header.liquid", "theme.css"];
    assert.deepEqual(linkablePages(files), [
      { path: "pages/index.liquid", route: "/", name: "Home" },
      { path: "pages/about.liquid", route: "/about", name: "About" },
    ]);
    assert.deepEqual(linkablePages(files, [{ path: "pages/about.liquid", url: "/about-us", name: "About us" }])[1], { path: "pages/about.liquid", route: "/about-us", name: "About us" });
  });
});
