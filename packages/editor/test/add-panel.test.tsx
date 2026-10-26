import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { type Extension } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { blockSourceFacet } from "@pagehub/engine/host";
import { AddPanel } from "../src/features/add/AddPanel.tsx";
import { TOOLBOX_HINT_DELAY_MS } from "../src/features/add/ComponentsTab.tsx";
import { mountCanvas, setRect } from "./canvasHarness.tsx";
import { actRun, render, withEditor, type Rendered } from "./harness.tsx";

export const PAGE = `<main class="p-4">\n  <h1>A</h1>\n  <div></div>\n</main>\n`;

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  localStorage.clear();
});

export function addEditor(src = PAGE, extra: Extension[] = []): TestEditor {
  return createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), ...extra] });
}

function mount(e: TestEditor, opened = true): Rendered {
  if (opened) actRun(e, "insert.open");
  const r = render(withEditor(e, <AddPanel />));
  open.push(r);
  return r;
}

/** Every category the old toolbox had, in today's order (the preset tiles join the element tiles). */
const ALL_TITLES = ["Layout", "Text", "Buttons", "Images", "Icons", "Interactive", "Navigation", "Forms", "Media", "Embeds", "Dividers", "Lists", "Tables", "Grid", "Components"];
const titles = (r: Rendered) => r.all("[data-tile-category]").map((c) => c.getAttribute("data-tile-category"));
const tiles = (r: Rendered) => r.all("[data-tile]").map((t) => t.getAttribute("data-tile"));
const wait = (ms: number) => act(async () => void (await new Promise((res) => setTimeout(res, ms))));

describe("add panel: components", () => {
  it("categories in today's order, empty ones hidden; a 3-column grid of tiles with bold headers; the Automatic tile under Layout", async () => {
    const r = mount(addEditor());
    assert.deepEqual(titles(r), ALL_TITLES);
    const layout = r.get('[data-tile-category="Layout"]');
    assert.ok(layout.querySelector(".grid-cols-3"));
    assert.ok(layout.querySelector(".font-bold"));
    assert.ok(layout.querySelector('[data-tile="automatic"]'));
  });

  it("search is focused after 50ms, filters from one character on label or name; a matching category title shows the whole category", async () => {
    const e = addEditor();
    const r = mount(e);
    await wait(60);
    const input = r.get("[data-add-search]") as HTMLInputElement;
    assert.equal(document.activeElement, input);
    await r.type(input, "h");
    assert.ok(tiles(r).includes("html.heading"));
    await r.type(input, "heading");
    assert.deepEqual(tiles(r), ["html.heading"]);
    await r.type(input, "media");
    assert.deepEqual(titles(r), ["Media"]);
    assert.equal(r.all('[data-tile-category="Media"] [data-tile]').length, r.all("[data-tile]").length);
  });

  it("category filter (with counts) narrows to one category; clear restores all", async () => {
    const r = mount(addEditor());
    await r.click(r.get('[data-filter="Category"] [data-filter-trigger]'));
    const text = r.get('[data-filter-item="Text"]').textContent;
    assert.match(text!, /^Text\d+$/);
    await r.click(r.get('[data-filter-item="Text"]'));
    assert.deepEqual(titles(r), ["Text"]);
    await r.click(r.get("[data-filter-clear]"));
    assert.deepEqual(titles(r), ALL_TITLES);
  });

  it("double-click a tile → inserted relative to the selection (inside an empty container, else after it), selected, one undo step (fixed: not index 1 of the selection)", async () => {
    const e = addEditor();
    e.select(e.get("h1"));
    const r = mount(e);
    await r.fire(r.get('[data-tile="html.text"]'), "dblclick");
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <p>Text</p>\n  <div></div>\n</main>\n`);
    assert.equal(e.state.selection.primary?.tag, "p");
    assert.ok(e.undo());
    assert.equal(e.text(), PAGE);
    act(() => e.select(e.get("div")));
    actRun(e, "insert.open");
    await r.fire(r.get('[data-tile="html.text"]'), "dblclick");
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <div><p>Text</p></div>\n</main>\n`);
  });

  it("the site's partials are a Reusable components category, last; double-click inserts {% render %}; code-only partials are left out", async () => {
    const e = createTestEditor({
      files: { "index.liquid": `<h1>A</h1>\n`, "partials/promo-bar.liquid": `<div>Free shipping</div>\n`, "partials/inject-head.liquid": `{% raw %}<style></style>{% endraw %}` },
      extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit()],
    });
    const r = mount(e);
    assert.equal(titles(r).at(-1), "Reusable components");
    assert.deepEqual(r.all('[data-tile-category="Reusable components"] [data-tile]').map((t) => t.getAttribute("data-tile")), ["partial:promo-bar"]);
    assert.match(r.get('[data-tile="partial:promo-bar"]').textContent!, /Promo bar/);
    await r.fire(r.get('[data-tile="partial:promo-bar"]'), "dblclick");
    assert.equal(e.text(), `<h1>A</h1>\n{% render 'promo-bar' %}\n`);
  });

  it("double-click with nothing selected → at the end of the page the canvas shows", async () => {
    const e = addEditor(`<h1>A</h1>\n<p>B</p>\n`);
    const r = mount(e);
    await r.fire(r.get('[data-tile="html.heading"]'), "dblclick");
    assert.equal(e.text(), `<h1>A</h1>\n<p>B</p>\n<h2>Heading</h2>\n`);
  });

  it("a click insert of the Automatic tile morphs to its spot, in one undo step", async () => {
    const e = addEditor(`<div class="flex flex-row">\n  <div>x</div>\n</div>\n`);
    e.select(e.get("div > div"));
    const r = mount(e);
    await r.fire(r.get('[data-tile="automatic"]'), "dblclick");
    assert.notEqual(e.text(), `<div class="flex flex-row">\n  <div>x</div>\n</div>\n`);
    assert.match(e.text(), /<div>x<\/div>\n  <div class="[^"]+"><\/div>/);
    assert.ok(e.undo());
    assert.equal(e.text(), `<div class="flex flex-row">\n  <div>x</div>\n</div>\n`);
  });

  it("tile tooltip: description + 'Drag · Double-click' after 500ms on the right; the tile turns accent on press", async () => {
    const r = mount(addEditor());
    const tile = r.get('[data-tile="html.heading"]');
    assert.equal(tile.getAttribute("data-tooltip-place"), "right");
    assert.equal(tile.getAttribute("data-tooltip-delay-show"), String(TOOLBOX_HINT_DELAY_MS));
    const html = tile.getAttribute("data-tooltip-html")!;
    assert.match(html, /heading/i);
    assert.match(html, /Drag<\/span>.*Double-click<\/span>/);
    assert.equal(tile.getAttribute("title"), null);
    await act(async () => void tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 5, clientY: 5 })));
    assert.equal(tile.getAttribute("data-pressed"), "");
    assert.ok(tile.firstElementChild!.className.includes("bg-accent"));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 5, clientY: 5 })));
  });

  it("drag a tile from the panel onto the canvas → inserted where it lands (one transaction)", async () => {
    const e = createTestEditor({ files: { "index.liquid": `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n</main>\n` }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit()] });
    const { r, doc } = await mountCanvas(e);
    open.push(r);
    setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(doc.querySelector("main")!, { left: 0, top: 0, width: 800, height: 100 });
    setRect(doc.querySelector("h1")!, { left: 0, top: 0, width: 800, height: 40 });
    setRect(doc.querySelector("p")!, { left: 0, top: 50, width: 800, height: 40 });
    actRun(e, "insert.open"); // the <Editor> already renders the Add panel slot
    const p = r;
    const tile = p.get('[data-add-components] [data-tile="html.heading"]');
    await act(async () => void tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 1100, clientY: 10 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 400, clientY: 85 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 400, clientY: 85 })));
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n  <h2>Heading</h2>\n</main>\n`);
  });
});

describe("add panel: shell", () => {
  it("insert.toggle opens and closes it; reopening restores the tab, category and query", async () => {
    const e = addEditor(PAGE, [blockSourceFacet.of({ blocks: () => [] })]);
    const r = mount(e, false);
    assert.equal(document.querySelector('[data-slot="AddPanel"]:not([hidden])'), null);
    actRun(e, "insert.toggle");
    assert.ok(r.get('[data-slot="AddPanel"]'));
    actRun(e, "insert.set", { tab: "blocks", query: "he" });
    actRun(e, "insert.toggle");
    assert.equal(document.querySelector('[data-slot="AddPanel"]:not([hidden])'), null);
    actRun(e, "insert.toggle");
    assert.equal(r.get('[data-add-tab="blocks"]').getAttribute("aria-selected"), "true");
    assert.equal((r.get("[data-add-search]") as HTMLInputElement).value, "he");
  });

  it("a selection change closes it (an undo doesn't); it sits between the nav and the docked layers", async () => {
    const e = addEditor();
    const r = mount(e);
    const panel = r.get('[data-slot="AddPanel"]');
    assert.equal(panel.style.top, "var(--editor-nav-height, 0px)");
    assert.equal(panel.style.bottom, "var(--sidebar-layers-height, 0px)");
    act(() => e.select(e.get("h1")));
    assert.equal(addPanelOf(e.state).open, false);
    actRun(e, "attr.set", { name: "id", value: "x" });
    actRun(e, "insert.open");
    actRun(e, "history.undo");
    assert.equal(addPanelOf(e.state).open, true, "undo keeps it open");
    assert.ok(r.get('[data-slot="AddPanel"]'));
    actRun(e, "panel.layers");
    assert.equal(addPanelOf(e.state).open, false, "popping out the layers closes it");
  });

  it("tabs Components | Blocks; ←/→ cycle; without a block source (or enabled: false) the strip is dropped", async () => {
    const e = addEditor(PAGE, [blockSourceFacet.of({ blocks: () => [] })]);
    const r = mount(e);
    const comp = r.get('[data-add-tab="components"]');
    await act(async () => void comp.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(addPanelOf(e.state).tab, "blocks");
    await act(async () => void r.get('[data-add-tab="blocks"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(addPanelOf(e.state).tab, "components");
    const plain = mount(addEditor());
    assert.equal(plain.container.querySelector("[role=tablist]"), null);
    const off = mount(addEditor(PAGE, [blockSourceFacet.of({ blocks: () => [], enabled: false })]));
    assert.equal(off.container.querySelector("[role=tablist]"), null);
    assert.ok(off.container.querySelector("[data-add-components]"));
  });
});
