import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CHUNK_SELECTORS } from "../src/chunks.ts";
import { CORE_SELECTORS } from "../src/selector.ts";

/** The attribute reference lives in docs/site-runtime.md; the README links to it. */
const readme = readFileSync(new URL("../../../docs/site-runtime.md", import.meta.url), "utf8");
const examples = [...readme.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");

/** Every attribute name inside the selector tables, e.g. `data-cart`, `commandfor`; `data-dismiss-close` is the part of `data-dismiss` that is clicked. */
const EXTRA_ATTRIBUTES = ["data-dismiss-close"];
const attributes = [...new Set([...[...Object.values(CHUNK_SELECTORS), ...CORE_SELECTORS].flatMap((sel) => [...sel.matchAll(/\[([a-z][a-z-]*)/g)].map((m) => m[1])), ...EXTRA_ATTRIBUTES])];

describe("README covers the loader's selector table", () => {
  it("finds attributes to check", () => assert.ok(attributes.length >= 25, `only ${attributes.length}`));
  for (const attr of attributes) {
    it(attr, () => {
      assert.ok(readme.includes("`" + attr + "`"), `${attr} is not described in README.md`);
      assert.ok(new RegExp(`[\\s"]${attr}[\\s=>"]`).test(examples), `${attr} has no html example in README.md`);
    });
  }
});
