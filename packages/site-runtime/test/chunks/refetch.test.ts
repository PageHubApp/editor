import { fire, resetDom, tick } from "../setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import * as refetch from "../../src/chunks/refetch.ts";
import * as state from "../../src/chunks/state.ts";
import { get, set } from "../../src/state-store.ts";
import { mountAll, q, w } from "./chunkHarness.ts";

/**
 * The storefront listing refetch: a `url:` key a region follows changes → the URL is written, the page fetched with
 * it, and the region swapped in place; its `data-state-seed` totals are written on mount and after the swap.
 */
const realFetch = w.fetch;
afterEach(() => void (w.fetch = realFetch));

/** Wait until `done()` holds (the debounce, then the fetch and the swap), or fail after a second. */
async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await tick(10);
  assert.ok(done(), "timed out");
}

/** A server that renders the grid from `?category=` and `?page=`, as the host does for a `query[...]` listing. */
function serve(urls: string[]) {
  w.fetch = async (href: string) => {
    urls.push(href);
    const u = new URL(href);
    const cat = u.searchParams.get("category") || "all";
    const page = u.searchParams.get("page") || "1";
    return new Response(`<html><body><div id="grid" data-refetch="category,page" data-state-seed="shop:page=${page};shop:pages=2"><b>${cat} p${page}</b></div><p id="other">server copy</p></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  };
}

describe("refetch", () => {
  it("seeds the totals, then on a chip swaps the grid in place and writes the URL; the rest of the page is untouched", async () => {
    const urls: string[] = [];
    serve(urls);
    w.history.replaceState(null, "", "/shop?utm=1");
    resetDom(`<button data-state-set="url:category:tees">Tees</button><div id="grid" data-refetch="category,page" data-state-seed="shop:page=1;shop:pages=4"><b>all p1</b></div><p id="other">local copy</p>`);
    mountAll(refetch, "[data-refetch]");
    mountAll(state, "[data-state-set]");
    assert.equal(get("shop:pages"), "4", "seeded on mount");

    fire(q("button"), "click");
    await until(() => q("#grid b")?.textContent === "tees p1");
    assert.equal(urls.length, 1);
    assert.equal(new URL(urls[0]!).search, "?utm=1&category=tees", "the visitor's other params are kept");
    assert.equal(w.location.search, "?utm=1&category=tees", "the address bar follows");
    assert.equal(q("#grid b").textContent, "tees p1", "the grid is the server's new render");
    assert.equal(q("#other").textContent, "local copy", "only [data-refetch] regions are swapped");
    mountAll(refetch, "[data-refetch]"); // the core mounts the swapped-in node; here the test does
    assert.equal(get("shop:pages"), "2", "the new region's seed is written");
  });

  it("data-state-clear on a url: key the URL already holds drops the param and refetches the unfiltered listing", async () => {
    const urls: string[] = [];
    serve(urls);
    w.history.replaceState(null, "", "/shop?category=tees&utm=1");
    resetDom(`<button id="all" data-state-clear="url:category">All</button><div id="grid" data-refetch="category,page"><b>tees p1</b></div>`);
    set("url:category", undefined);
    w.history.replaceState(null, "", "/shop?category=tees&utm=1");
    mountAll(refetch, "[data-refetch]");
    mountAll(state, "[data-state-clear]");
    assert.equal(get("url:category"), "tees", "the URL holds the value");
    fire(q("#all"), "click");
    assert.equal(get("url:category"), undefined, "the value does not read back from the query string");
    assert.equal(w.location.search, "?utm=1", "the param is gone, the visitor's others stay");
    await until(() => q("#grid b")?.textContent === "all p1");
    assert.equal(new URL(urls.at(-1)!).searchParams.has("category"), false);
  });

  it("a change it doesn't follow fetches nothing; quick changes fetch once, with the last value", async () => {
    const urls: string[] = [];
    serve(urls);
    w.history.replaceState(null, "", "/shop");
    resetDom(`<div id="grid" data-refetch="category,page"><b>all p1</b></div>`);
    set("url:category", undefined); // the store is global: the first test chose tees (no listing is mounted yet)
    mountAll(refetch, "[data-refetch]");
    set("cart:open", "true");
    set("url:sort", "price");
    await tick(200);
    assert.equal(urls.length, 0, "keys the grid doesn't follow");
    set("url:page", "2");
    set("url:page", "3");
    await until(() => q("#grid b")?.textContent === "all p3");
    assert.equal(urls.length, 1);
    assert.equal(new URL(urls[0]!).searchParams.get("page"), "3");
    assert.equal(q("#grid b").textContent, "all p3");
  });

  it("facet.* follows every url:facet.<key> selection", async () => {
    const urls: string[] = [];
    serve(urls);
    w.history.replaceState(null, "", "/shop");
    resetDom(`<div id="grid" data-refetch="facet.*"><b>x</b></div>`);
    mountAll(refetch, "[data-refetch]");
    set("url:facet.color", "red");
    await until(() => urls.length > 0);
    assert.equal(new URL(urls.at(-1)!).searchParams.get("facet.color"), "red");
  });

  it("in the editing canvas it seeds but never fetches", async () => {
    const urls: string[] = [];
    serve(urls);
    resetDom(`<div id="grid" data-refetch="category" data-state-seed="edit:seed=1"><b>x</b></div>`);
    document.documentElement.setAttribute("data-ph-edit", "");
    try {
      mountAll(refetch, "[data-refetch]");
      assert.equal(get("edit:seed"), "1");
    } finally {
      document.documentElement.removeAttribute("data-ph-edit");
    }
  });
});
