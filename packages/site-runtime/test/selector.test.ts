import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CHUNK_SELECTORS } from "../src/chunks.ts";
import { CORE_SELECTORS, RUNTIME_SELECTOR, needsRuntime } from "../src/selector.ts";
import "./setup.ts";

/** One opening tag that matches a simple selector: `button[commandfor]` → `<button commandfor>`, `[popover="manual"]` → `<div popover="manual">`. */
function sample(simple: string): string {
  const bare = simple.replace(/:not\([^)]*\)/g, "");
  const m = /^([a-z][a-z0-9-]*)?\[([a-z][a-z0-9-]*)(?:=(?:"([^"]*)"|([^\]]*)))?\]$/.exec(bare)!;
  const value = m[3] ?? m[4];
  return `<${m[1] ?? "div"} ${m[2]}${value === undefined ? "" : `="${value}"`}>`;
}
const alternatives = (sel: string) => sel.replace(/:not\([^)]*\)/g, "").split(",");

describe("every chunk selector is covered by needsRuntime and RUNTIME_SELECTOR", () => {
  const all = [...Object.entries(CHUNK_SELECTORS), ...CORE_SELECTORS.map((s) => ["core " + s, s] as const)];
  for (const [name, sel] of all) {
    for (const alt of alternatives(sel)) {
      it(`${name}: ${alt}`, () => {
        assert.ok(needsRuntime(`<main>${sample(alt)}</main>`), `needsRuntime misses ${alt}`);
        document.body.innerHTML = sample(alt);
        assert.ok(document.body.querySelector(RUNTIME_SELECTOR), `RUNTIME_SELECTOR misses ${alt}`);
      });
    }
  }
  it("every chunk file has a selector, and every selector a chunk file", () => {
    const files = readdirSync(fileURLToPath(new URL("../src/chunks", import.meta.url))).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
    assert.deepEqual(Object.keys(CHUNK_SELECTORS).sort(), files.sort());
  });
  it("RUNTIME_SELECTOR contains every selector verbatim", () => {
    for (const [, sel] of all) assert.ok(RUNTIME_SELECTOR.includes(sel), sel);
  });
  it("the attributes the old list missed are detected", () => {
    for (const html of ['<div data-map="{}">', "<div data-carousel>", "<button data-state-set='a:b'>", "<span data-state-text=x>", "<div data-fit-text>", '<div data-show-on="x">']) assert.ok(needsRuntime(html), html);
  });
});

describe("needsRuntime", () => {
  it("is false for a page with none of the attributes", () => {
    assert.equal(needsRuntime('<!doctype html><html><body><a href="/x" class="btn" data-id="1">x</a><form action="/f"><input name=a></form></body></html>'), false);
  });
  it("only counts attributes on tags, not in text", () => {
    assert.equal(needsRuntime("<p>add data-cart to a button</p>"), false);
  });
  it("sees an attribute after a quoted value containing >", () => {
    assert.ok(needsRuntime('<div title="a>b" data-animate="fade">'));
  });
  it("honours tag and value: commandfor needs a button, popover needs manual", () => {
    assert.equal(needsRuntime("<div commandfor=x>"), false);
    assert.ok(needsRuntime("<button commandfor=x>"));
    assert.equal(needsRuntime('<div popover="auto">'), false);
    assert.ok(needsRuntime("<div popover=manual>"));
  });
  it("is case-insensitive on names", () => {
    assert.ok(needsRuntime("<DIV DATA-COPY='x'>"));
  });
});
