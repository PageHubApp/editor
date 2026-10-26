import { fire, resetDom, tick } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setChunkLoader, type ChunkModule } from "../src/chunks.ts";
import { readConfig } from "../src/config.ts";
import { start } from "../src/core.ts";

const cfg = { chunkBase: "https://cdn.test/c/" };
let requested: string[] = [];
let mounts: Element[] = [];
let stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((f) => f()));
const go = (c = cfg) => void stops.push(start(document, c));
beforeEach(() => {
  requested = [];
  mounts = [];
  setChunkLoader(async (url) => {
    requested.push(url);
    return { mount: (el) => void mounts.push(el) } satisfies ChunkModule;
  });
});

describe("core and loader", () => {
  it("requests a chunk once when its attribute is present", async () => {
    resetDom('<div data-animate="fade-up"></div><div data-animate="fade-in"></div>');
    go();
    await tick();
    assert.deepEqual(requested, ["https://cdn.test/c/animate.js"]);
    assert.equal(mounts.length, 2);
  });

  it("requests nothing for a page without runtime attributes", async () => {
    resetDom("<p>hi</p>");
    go();
    await tick();
    assert.deepEqual(requested, []);
  });

  it("picks up nodes added later and mounts each element once", async () => {
    resetDom("<p>hi</p>");
    go();
    await tick();
    document.body.insertAdjacentHTML("beforeend", '<nav data-scrollspy></nav>');
    await tick(10);
    assert.deepEqual(requested, ["https://cdn.test/c/scrollspy.js"]);
    assert.equal(mounts.length, 1);
  });

  it("is a no-op the second time", async () => {
    resetDom('<div data-track="ga4:x"></div>');
    go();
    go();
    await tick();
    assert.equal(requested.length, 1);
  });

  it("a failed chunk does not throw, and animate content is revealed", async () => {
    setChunkLoader(async () => {
      throw new Error("404");
    });
    resetDom('<div data-animate="fade-up"></div>');
    go();
    await tick();
    assert.ok(document.querySelector("[data-animate]")!.hasAttribute("data-animated"));
  });

  it("parses the runtime config script", () => {
    resetDom('<script type="application/json" id="runtime-config">{"nonce":"n1","cart":{"endpoint":"/c"},"chunkBase":"/js"}</script>');
    const c = readConfig(document);
    assert.equal(c.nonce, "n1");
    assert.equal(c.cart?.endpoint, "/c");
    assert.equal(c.chunkBase, "/js/");
  });

  it("falls back to defaults on missing or invalid config", () => {
    resetDom('<script type="application/json" id="runtime-config">{oops</script>');
    assert.ok(readConfig(document).chunkBase.endsWith("/chunks/"));
    resetDom();
    assert.ok(readConfig(document).chunkBase.endsWith("/chunks/"));
  });

  it("sets html[data-runtime]", () => {
    resetDom();
    go();
    assert.ok(document.documentElement.hasAttribute("data-runtime"));
    fire(document.body, "click");
  });
});
