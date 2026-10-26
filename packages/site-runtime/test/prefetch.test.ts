import { fire, resetDom, tick } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setChunkLoader } from "../src/chunks.ts";
import { start } from "../src/core.ts";

const cfg = { chunkBase: "https://cdn.test/c/" };
const stops: (() => void)[] = [];
const prefetched = () => [...document.head.querySelectorAll('link[rel="prefetch"]')].map((l) => l.getAttribute("href"));
const go = () => void stops.push(start(document, cfg));
const nav = navigator as any;
const supports = (HTMLScriptElement as any).supports;

afterEach(() => {
  stops.splice(0).forEach((f) => f());
  delete nav.connection;
  (HTMLScriptElement as any).supports = supports;
});

describe("prefetch on intent (browsers without Speculation Rules)", () => {
  setChunkLoader(async () => ({}));

  it("prefetches a same-origin link once the pointer rests on it, once per URL", async () => {
    resetDom('<a id=a href="/pricing">p</a>');
    go();
    await tick();
    fire(document.querySelector("#a")!, "mouseover");
    await tick(100);
    fire(document.querySelector("#a")!, "mouseover");
    await tick(100);
    assert.deepEqual(prefetched(), ["https://example.test/pricing"]);
  });

  it("a pointer that leaves before 65 ms prefetches nothing", async () => {
    resetDom('<a id=a href="/pricing">p</a>');
    go();
    await tick();
    fire(document.querySelector("#a")!, "mouseover");
    fire(document.querySelector("#a")!, "mouseout");
    await tick(100);
    assert.deepEqual(prefetched(), []);
  });

  it("touchstart prefetches at once", async () => {
    resetDom('<a id=a href="/about"><span id=s>a</span></a>');
    go();
    await tick();
    fire(document.querySelector("#s")!, "touchstart");
    assert.deepEqual(prefetched(), ["https://example.test/about"]);
  });

  it("skips other origins, query strings, hashes of this page, downloads, new tabs, nofollow and the excluded paths", async () => {
    resetDom(
      '<a id=a href="https://other.test/x">1</a><a id=b href="/shop?x=1">2</a><a id=c href="/#top">3</a><a id=d href="/f.pdf" download>4</a>' +
        '<a id=e href="/t" target="_blank">5</a><a id=f href="/n" rel="nofollow">6</a><a id=g href="/cart">7</a><a id=h href="/account/orders">8</a><a id=i href="/api/x">9</a><a id=j href="mailto:a@b.c">10</a>',
    );
    go();
    await tick();
    for (const id of "abcdefghij") fire(document.querySelector("#" + id)!, "touchstart");
    assert.deepEqual(prefetched(), []);
  });

  it("is off under Save-Data and on a 2g connection", async () => {
    for (const connection of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
      Object.defineProperty(nav, "connection", { value: connection, configurable: true });
      resetDom('<a id=a href="/about">a</a>');
      go();
      await tick();
      fire(document.querySelector("#a")!, "touchstart");
      assert.deepEqual(prefetched(), [], JSON.stringify(connection));
      stops.splice(0).forEach((f) => f());
    }
  });

  it("is off where the browser supports Speculation Rules", async () => {
    (HTMLScriptElement as any).supports = (t: string) => t === "speculationrules";
    resetDom('<a id=a href="/about">a</a>');
    go();
    await tick();
    fire(document.querySelector("#a")!, "touchstart");
    assert.deepEqual(prefetched(), []);
  });

  it("is off on the editing canvas", async () => {
    resetDom('<a id=a href="/about">a</a>');
    document.documentElement.setAttribute("data-ph-edit", "");
    go();
    await tick();
    fire(document.querySelector("#a")!, "touchstart");
    document.documentElement.removeAttribute("data-ph-edit");
    assert.deepEqual(prefetched(), []);
  });
});
