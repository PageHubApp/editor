import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "react";
import { checkContentOnly } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { mediaFacet, memoryMediaStore } from "@pagehub/engine/host";
import { Editor, editorKit } from "../src/index.ts";
import { MediaManager } from "../src/features/media/MediaManager.tsx";
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

const LIBRARY = memoryMediaStore({ items: [{ id: "m1", name: "door.png", contentType: "image/png", size: 10, folder: null, url: "https://cdn.test/m1.png", createdAt: 1, alt: "A red door" }] });

function client(): TestEditor {
  return createTestEditor({ files: FILES, extensions: [htmlKit(), tailwindKit(), liquidKit(), editorKit(), mediaFacet.of(LIBRARY)], role: "client" });
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

  it("picking an image, its description and a link's href pass the content gate", async () => {
    const e = client();
    e.select(e.get("img"));
    const r = render(<Editor editor={e} components={{ MediaManager }} />);
    assert.ok(r.get("[data-content-fields] [data-media-card]"), "the image card");
    await r.click(r.all("button").find((b) => b.textContent?.trim() === "Replace")!);
    await act(async () => void (await new Promise((res) => setTimeout(res, 20))));
    await r.click(r.get("[data-media-id='m1']"));
    await r.click(r.all("button").find((b) => b.textContent?.trim() === "Select")!);
    await act(async () => void (await new Promise((res) => setTimeout(res, 20))));
    assert.match(e.text(), /src="https:\/\/cdn\.test\/m1\.png"/, "a client's pick is the file's plain address (no Liquid)");
    assert.match(e.text(), /alt="A"/, "an existing description is kept");
    await r.type(r.get("#input-content-alt"), "A photo");
    assert.match(e.text(), /alt="A photo"/);
    await act(async () => e.select(e.get("a")));
    assert.ok(r.get("[data-content-fields] [data-link-picker]"), "the shared link picker");
    assert.equal(r.all("[data-link-new-tab]").length, 0, "only href passes the content gate: no new-tab choice");
    assert.equal(r.get<HTMLInputElement>("#input-content-link-web").value, "/shop", "a path that is no page opens as a web address");
    await r.type(r.get("#input-content-link-web"), "/sale");
    assert.match(e.text(), /href="\/sale"/);
    await r.click(r.all('[data-link-picker] [role="tab"]').find((t) => t.textContent === "Page")!);
    await r.click(r.get('[data-link-page="/"]'));
    assert.match(e.text(), /href="\/"/);
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
