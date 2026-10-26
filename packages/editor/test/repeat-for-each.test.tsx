import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { menusFacet } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";

const SRC = `<ul>\n  <li id="row">Row</li>\n</ul>\n`;
const make = (extensions: unknown[] = [liquidKit()]) => createTestEditor({ files: { "index.liquid": SRC }, extensions: [htmlKit(), tailwindKit(), ...extensions, editorKit()] as never });

describe("Repeat for each…", () => {
  it("is not a canvas/context row (the dashboard editor's menu has none)", () => {
    const e = make();
    assert.ok(!e.state.facet(menusFacet)["canvas/context"]!.some((m) => m.command === "element.repeatForEach"));
  });
  it("wraps the selected element in a for loop as one undo step", () => {
    const e = make();
    e.select(e.get("li"));
    assert.ok(e.can("element.repeatForEach"));
    assert.ok(e.run("element.repeatForEach"));
    assert.match(e.text(), /\{% for item in items %\}\s*<li id="row">Row<\/li>\s*\{% endfor %\}/);
    assert.ok(e.undo());
    assert.equal(e.text(), SRC);
  });
  it("can't run on an element already in a loop, with nothing selected, or without the Liquid kit", () => {
    const e = make();
    e.select(e.get("li"));
    e.run("element.repeatForEach");
    e.select(e.get("li"));
    assert.equal(e.can("element.repeatForEach"), false);
    e.run("selection.clear");
    assert.equal(e.can("element.repeatForEach"), false);
    const bare = make([]);
    bare.select(bare.get("li"));
    assert.equal(bare.can("element.repeatForEach"), false);
  });
});
