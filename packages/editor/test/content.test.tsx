import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "react";
import { checkContentOnly } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { countWrites, render } from "./harness.tsx";

const PAGE = `<section class="intro">
  <h1 data-editable="text">Welcome</h1>
  <p>Static copy</p>
  <img data-editable="image" class="w-full" src="a.jpg" alt="A">
  <a data-editable="link" class="btn" href="/shop">Shop</a>
</section>
{% section 'hero', headline: "Hello" %}
`;
const HERO = `<h1>{{ section.settings.headline }}</h1>
{% schema %}
{ "name": "Hero", "settings": [ { "id": "headline", "type": "text", "label": "Headline" } ] }
{% endschema %}
`;
const FILES = { "index.liquid": PAGE, "sections/hero.liquid": HERO };

function client(): TestEditor {
  return createTestEditor({ files: FILES, extensions: [htmlKit(), tailwindKit(), liquidKit(), editorKit()], role: "client" });
}

/** Every file's text passes the engine's content gate against its original. */
function assertContentOnly(e: TestEditor): void {
  for (const [path, text] of e.state.files) {
    const r = checkContentOnly(FILES[path as keyof typeof FILES], text, { bundle: e.state.files });
    assert.ok(r.ok, `${path}: ${r.ok ? "" : r.reason}`);
  }
}

describe("content mode (client role)", () => {
  it("hides the structure slots and shows the client inspector", () => {
    const e = client();
    e.select(e.get("img"));
    const r = render(<Editor editor={e} />);
    for (const slot of ["AddPanel", "LayersPanel", "CodeView"]) assert.equal(r.all(`[data-slot="${slot}"]`).length, 0, slot);
    assert.equal(r.all('[data-slot="Inspector"]').length, 0, "default inspector replaced");
    assert.ok(r.get("[data-content-fields]"));
    assert.equal(r.all("[data-inspector-panel]").length, 0, "no class / layout / effects tabs");
    assert.equal(r.get("[data-ph-editor-scope]").getAttribute("data-role"), "client");
    r.unmount();
  });

  it("a host cannot put a structure slot back", () => {
    const Mine = () => <div id="mine" />;
    const r = render(<Editor editor={client()} components={{ LayersPanel: Mine }} />);
    assert.equal(r.all("#mine").length, 0);
    r.unmount();
  });

  it("structural commands report can() false and a drag, delete or move produces no transaction", () => {
    const e = client();
    const writes = countWrites(e);
    e.select(e.get("h1"));
    for (const [id, args] of [["element.remove"], ["element.duplicate"], ["element.moveDown"], ["element.moveUp"], ["element.wrap", { tag: "div" }]] as const) {
      assert.equal(e.can(id, args), false, `${id} can`);
      assert.equal(e.run(id, args), false, `${id} run`);
    }
    const before = e.state;
    assert.equal(e.press("Delete").handled, false, "Delete key");
    assert.equal(e.press("Backspace").handled, false, "Backspace key");
    // a drag drop is a text move of the node: the content gate vetoes it
    const h1 = e.get("h1");
    const p = e.get("p");
    const moved = e.dispatch((tr) => tr.replace({ path: "index.liquid", from: p.range.to, to: p.range.to }, h1.text()).replace({ path: "index.liquid", from: h1.range.from, to: h1.range.to }, ""));
    assert.equal(moved, false);
    assert.equal(e.state.files, before.files);
    assert.equal(writes.n, 0);
    assert.equal(e.diff(), "");
  });

  it("only editable elements and sections are selectable", () => {
    const e = client();
    e.select(e.get("p"));
    e.select(e.get("section"));
    assert.equal(e.state.selection.handles.length, 0);
    e.select(e.get("a"));
    assert.equal(e.state.selection.primary?.tag, "a");
  });

  it("editing an image's address and a link's href passes the content gate", async () => {
    const e = client();
    e.select(e.get("img"));
    const r = render(<Editor editor={e} />);
    await r.type(r.get("#input-content-src"), "b.jpg");
    assert.match(e.text(), /src="b\.jpg"/);
    await r.type(r.get("#input-content-alt"), "A photo");
    assert.match(e.text(), /alt="A photo"/);
    await act(async () => e.select(e.get("a")));
    await r.type(r.get("#input-content-href"), "/sale");
    assert.match(e.text(), /href="\/sale"/);
    assertContentOnly(e);
    r.unmount();
  });

  it("a section's settings are editable; class edits on an editable element are not", () => {
    const e = client();
    const section = e.handle("index.liquid", PAGE.indexOf("{% section") + 4)!;
    assert.equal(section.kind, "liquid-tag");
    e.select(section);
    assert.equal(e.run("liquid.setArg", { name: "headline", value: "\"Hi there\"" }), true);
    assert.match(e.text(), /headline: "Hi there"/);
    e.select(e.get("img"));
    assert.equal(e.run("attr.set", { name: "class", value: "w-half", at: e.get("img") }), false);
    assertContentOnly(e);
  });

  it("the owner role keeps the full UI", () => {
    const e = createTestEditor({ files: FILES, extensions: [htmlKit(), tailwindKit(), liquidKit(), editorKit()] });
    e.select(e.get("h1"));
    const r = render(<Editor editor={e} />);
    assert.equal(r.all('[data-slot="LayersPanel"]').length, 1);
    assert.equal(e.can("element.remove"), true);
    r.unmount();
  });
});
