import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { defineCommand } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { CanvasFrameContext } from "../src/features/canvas/canvasContext.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { EMPTY_HINT_TIPS, EmptyHint, EmptyHintLayer, emptyHintLabel, showsEmptyHint } from "../src/features/canvas/EmptyHint.tsx";
import { IncludeInAiButton, SelectMapButton } from "../src/features/canvas/NodeToolExtras.tsx";
import { aiChatFacet } from "../src/features/menus/aiChat.ts";
import { frameDoc, frameEl, mountCanvas, setRect } from "./canvasHarness.tsx";
import { render, withEditor, type Rendered } from "./harness.tsx";

const PAGE = `<main class="p-4">\n  <section></section>\n  <header></header>\n  <footer class="x"></footer>\n  <div class="bg-primary"></div>\n  <div style="color:red"></div>\n  <div data-edit-name="Spacer"></div>\n  <section>\n    <p>full</p>\n  </section>\n  <img src="/a.png" alt="">\n</main>\n`;
const ed = (src = PAGE, extra: object[] = []) => createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), ...extra] as never });
let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
});

describe("empty canvas hint", () => {
  it("labels: Empty page / Global header / Global footer / the element's name; hidden for a bg-* class, an inline style, content, media and void tags", () => {
    const e = ed();
    const [section, header, footer, bgDiv, styleDiv, named] = [e.find("index.liquid", "section")[0]!, e.get("header"), e.get("footer"), e.find("index.liquid", "div")[0]!, e.find("index.liquid", "div")[1]!, e.find("index.liquid", "div")[2]!];
    assert.equal(showsEmptyHint(section), true);
    assert.equal(emptyHintLabel(section), "Section");
    assert.equal(emptyHintLabel(header), "Global header");
    assert.equal(emptyHintLabel(footer), "Global footer");
    assert.equal(emptyHintLabel(named), "Spacer");
    assert.equal(showsEmptyHint(bgDiv), false, "a background class");
    assert.equal(showsEmptyHint(styleDiv), false, "a root style");
    assert.equal(showsEmptyHint(e.find("index.liquid", "section")[1]!), false, "has content");
    assert.equal(showsEmptyHint(e.get("img")), false, "not a container");
    const empty = ed("<main></main>\n");
    assert.equal(emptyHintLabel(empty.get("main")), "Empty page");
  });

  it("selected: three tips with tooltips; a click opens the Blocks panel", async () => {
    const e = ed();
    const h = e.get("header");
    const r = render(withEditor(e, <><EmptyHint handle={h} selected={false} /><span data-sep /></>));
    open.push(r);
    assert.equal(r.all("[data-empty-tip]").length, 0);
    r.rerender(withEditor(e, <EmptyHint handle={h} selected />));
    assert.deepEqual(r.all("[data-empty-tip]").map((t) => t.dataset.emptyTip), [...EMPTY_HINT_TIPS]);
    assert.ok(r.all("[data-empty-tip]").every((t) => t.getAttribute("data-tooltip-content") === t.dataset.emptyTip && t.getAttribute("data-tooltip-id")));
    await r.click(r.get("[data-empty-hint]"));
    assert.equal(addPanelOf(e.state).open, true);
    assert.equal(addPanelOf(e.state).tab, "blocks");
  });

  it("the layer puts one chip in every empty container of the page, over its rect", async () => {
    const e = ed();
    const { r, doc } = await mountCanvas(e);
    open.push(r);
    const host = document.createElement("div");
    document.body.appendChild(host);
    setRect(frameEl(r), { left: 0, top: 0, width: 800, height: 600 });
    setRect(host, { left: 0, top: 0, width: 800, height: 600 });
    doc.querySelectorAll("section")[0]!.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 40, right: 310, bottom: 60, x: 10, y: 20, toJSON() {} }) as DOMRect;
    const layer = render(
      withEditor(e, <CanvasFrameContext.Provider value={{ frame: frameEl(r), doc: frameDoc(r), version: 1, host }}><EmptyHintLayer /></CanvasFrameContext.Provider>),
    );
    open.push(layer);
    await act(async () => void (await new Promise((res) => setTimeout(res, 10))));
    const chips = layer.all("[data-empty-hint]").map((c) => c.textContent);
    assert.deepEqual(chips, ["Section", "Global header", "Global footer", "Spacer"]);
    const box = layer.get("[data-slot=EmptyHintLayer] > div") as HTMLElement;
    assert.deepEqual([box.style.left, box.style.top, box.style.width, box.style.height], ["10px", "20px", "300px", "40px"]);
  });
});

describe("node tools: Include in AI chat, Select Map", () => {
  it("Include in AI chat shows only with a host AI command, and runs it with the element", async () => {
    const got: string[] = [];
    const cmd = defineCommand<{ at?: { tag: string } }>({ id: "host.aiInclude", title: "AI", run: (ctx, a) => (ctx.dispatch && got.push(a?.at?.tag ?? "?"), true) });
    const plain = ed();
    plain.select(plain.get("header"));
    const r0 = render(withEditor(plain, <IncludeInAiButton />));
    open.push(r0);
    assert.equal(r0.container.querySelector("[data-node-ai]"), null);
    const e = ed(PAGE, [cmd, aiChatFacet.of("host.aiInclude")]);
    e.select(e.get("header"));
    const r = render(withEditor(e, <IncludeInAiButton />));
    open.push(r);
    assert.equal(r.get("[data-node-ai]").getAttribute("aria-label"), "Include in AI chat");
    await r.click(r.get("[data-node-ai]"));
    assert.deepEqual(got, ["header"]);
  });

  it("Select Map: on a pin or route inside {% map %} it selects the map; nowhere else", async () => {
    const src = `<main>\n  {% map lat: 33.8, lng: -118.3, zoom: 13 %}\n    <address data-pin="33.8,-118.3">Shop</address>\n    <span data-route="33.8,-118.3; 33.9,-118.4">Walk</span>\n  {% endmap %}\n  <p>x</p>\n</main>\n`;
    const e = ed(src, [liquidKit()]);
    const rect = { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 };
    const r = render(withEditor(e, <SelectMapButton rect={rect} />));
    open.push(r);
    e.select(e.get("p"));
    await act(async () => void e.run("selection.clear"));
    assert.equal(r.container.querySelector("[data-select-map]"), null, "nothing selected");
    await act(async () => void e.select(e.get("address")));
    assert.ok(r.get("[data-select-map]"));
    await act(async () => void e.select(e.get("p")));
    assert.equal(r.container.querySelector("[data-select-map]"), null, "an ordinary element");
    await act(async () => void e.select(e.find("index.liquid", "span")[0]!));
    await r.click(r.get("[data-select-map]"));
    assert.equal(e.state.selection.primary?.tag, "map");
  });
});
