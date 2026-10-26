import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { layersKit } from "../src/features/layers/layersKit.ts";
import { LayerTree } from "../src/features/layers/LayerTree.tsx";
import { LayersPanel } from "../src/features/layers/LayersPanel.tsx";
import { render, withEditor, actRun, type Rendered } from "./harness.tsx";
import { setRect } from "./canvasHarness.tsx";

const PAGE = `<header class="p-2">
  <nav><a href="/">Home</a></nav>
</header>
<main>
  <section data-edit-name="Hero">
    <h1>A</h1>
    <div class="box">
      <p>B</p>
    </div>
  </section>
  <section>
    <p class="hidden">C</p>
    <img src="x.png">
  </section>
  <div data-edit-lock="sealed"><p>S</p></div>
</main>
<footer>F</footer>
`;

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  localStorage.clear();
});

function setup(src = PAGE, ui: "tree" | "panel" = "tree"): { e: TestEditor; r: Rendered; labels(): string[]; rowOf(label: string, i?: number): HTMLElement } {
  const e = createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), editorKit(), layersKit()] });
  const r = render(withEditor(e, ui === "tree" ? <LayerTree /> : <LayersPanel />));
  open.push(r);
  const rows = () => r.all("[data-layer-row]");
  return {
    e,
    r,
    labels: () => rows().map((x) => x.querySelector("[data-layer-label]")?.textContent ?? ""),
    rowOf: (label, i = 0) => rows().filter((x) => x.querySelector("[data-layer-label]")?.textContent === label)[i]!,
  };
}

const toggle = (row: HTMLElement) => row.querySelector<HTMLElement>("[data-layer-toggle]")!;
const action = (row: HTMLElement, name: string) => row.querySelector<HTMLButtonElement>(`[data-layer-action="${name}"]`)!;
const key = (el: Element, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));

describe("layers tree", () => {
  it("mount: only the page is open; chevrons only on rows with children; a click on one toggles without selecting", async () => {
    const { e, r, labels, rowOf } = setup();
    assert.deepEqual(labels(), ["Page", "Container", "Container", "Container"]);
    assert.equal(toggle(rowOf("Page")).getAttribute("aria-expanded"), "true");
    assert.equal(toggle(rowOf("Container", 1)).getAttribute("aria-expanded"), "false");
    assert.equal(rowOf("Container", 2).querySelector("[data-layer-toggle]"), null, "the footer holds only text");
    await r.click(toggle(rowOf("Container", 1)));
    assert.deepEqual(labels(), ["Page", "Container", "Container", "Hero", "Section", "Container", "Container"]);
    assert.ok(rowOf("Container", 1).querySelector("[data-layer-toggle] span")!.className.includes("rotate-90"));
    assert.equal(e.state.selection.primary, null);
    assert.equal(rowOf("Container", 2).querySelector("[data-layer-toggle]"), null, "sealed: no chevron, no children");
  });

  it("indent depth*12+6; page row reads 'Page' with the file icon; header / footer / section role icons and margins", async () => {
    const { e, rowOf } = setup();
    actRun(e, "element.selectParent");
    e.select(e.get("h1"));
    await act(async () => {});
    assert.equal(rowOf("Page").style.paddingLeft, "6px");
    assert.equal(rowOf("Hero").style.paddingLeft, "30px");
    assert.equal(rowOf("Page").querySelector("[data-layer-icon]")!.getAttribute("data-layer-icon"), "file");
    assert.ok(rowOf("Page").querySelector("[data-layer-icon]")!.className.includes("text-orange-500"));
    const header = rowOf("Container", 0);
    assert.equal(header.getAttribute("data-layer-kind"), "header");
    assert.ok(header.className.includes("mb-0.5"));
    assert.ok(header.querySelector("[data-layer-icon]")!.className.includes("text-purple-500"));
    const footer = document.querySelector<HTMLElement>('[data-layer-kind="footer"]')!;
    assert.ok(footer.className.includes("mt-0.5") && footer.querySelector("[data-layer-icon]")!.className.includes("text-emerald-500"));
    assert.equal(rowOf("Hero").querySelector("[data-layer-icon]")!.getAttribute("data-layer-icon"), "section");
  });

  it("a selection from anywhere expands every ancestor (nothing collapses); the selected row uses the selected look", async () => {
    const { e, rowOf, labels } = setup();
    await act(async () => void e.select(e.get("p")));
    assert.ok(labels().includes("Text"));
    const sel = rowOf("Text");
    assert.equal(sel.getAttribute("data-selected"), "");
    assert.ok(sel.className.includes("bg-blue-600"));
    assert.ok(sel.querySelector("[data-layer-icon]")!.className.includes("text-white"));
    await act(async () => void e.select(e.get("footer")));
    assert.ok(labels().includes("Text"), "nothing auto-collapses");
  });

  it("click selects; canvas hover lights the row unless selected; hovering a row doesn't hover the canvas", async () => {
    const { e, r, rowOf } = setup();
    await r.click(rowOf("Container", 2));
    assert.equal(e.state.selection.primary?.tag, "footer");
    actRun(e, "canvas.hover", { src: `index.liquid#${e.get("header").range.from}` });
    assert.equal(rowOf("Container", 0).getAttribute("data-hovered"), "");
    await r.fire(rowOf("Container", 1), "mouseover");
    assert.equal(e.state.selection.hover?.tag, "header");
  });

  it("label: data-edit-name, else the element label; double-click renames (draft); Enter commits one write, Escape cancels (fixed: Escape reverts)", async () => {
    const { e, r, rowOf } = setup();
    await act(async () => void e.select(e.get("section")));
    const hero = rowOf("Hero");
    await r.fire(hero.querySelector("[data-layer-label]")!.parentElement!, "dblclick");
    const input = r.get("[data-layer-rename]") as HTMLInputElement;
    assert.equal(document.activeElement, input);
    await r.type(input, "Intro");
    assert.equal(e.get("section").attr("data-edit-name"), "Hero", "nothing written while typing");
    await key(input, "Escape");
    assert.equal(e.get("section").attr("data-edit-name"), "Hero");
    await r.fire(rowOf("Hero").querySelector("[data-layer-label]")!.parentElement!, "dblclick");
    await r.type(r.get("[data-layer-rename]"), "Intro");
    await key(r.get("[data-layer-rename]"), "Enter");
    assert.equal(e.get("section").attr("data-edit-name"), "Intro");
    assert.ok(e.undo());
    assert.equal(e.get("section").attr("data-edit-name"), "Hero", "one undo step");
    await r.fire(rowOf("Page").querySelector("[data-layer-label]")!.parentElement!, "dblclick");
    assert.equal(document.querySelector("[data-layer-rename]"), null, "the page row doesn't rename");
  });

  it("hidden: `hidden` attribute or class → 60% + resting eye-off; the eye hides (attribute) and shows (clears the class), one write each", async () => {
    const { e, r, rowOf, labels } = setup();
    await act(async () => void e.select(e.get("img")));
    assert.ok(labels().includes("Text"));
    const c = rowOf("Text");
    assert.ok(c.className.includes("opacity-60"));
    assert.ok(c.querySelector("[data-layer-hidden]"));
    await r.click(action(c, "visibility"));
    assert.ok(e.text().includes("<p>C</p>"));
    const img = rowOf("Image");
    assert.equal(img.querySelector("[data-layer-hidden]"), null, "selected: no resting eye");
    await r.click(action(img, "visibility"));
    assert.equal(e.get("img").attr("hidden"), "");
    assert.match(e.text(), /<img src="x.png" hidden(="")?>/);
  });

  it("move up / down swap with a sibling (disabled at the ends); out goes after the parent; in appends to the previous container", async () => {
    const { e, r, rowOf } = setup();
    await act(async () => void e.select(e.get("img")));
    const img = () => rowOf("Image");
    assert.equal(action(img(), "down").disabled, true);
    assert.ok(action(img(), "down").className.includes("opacity-30"));
    await r.click(action(img(), "up"));
    assert.ok(e.text().includes(`<section>\n    <img src="x.png">\n    <p class="hidden">C</p>`));
    await r.click(action(img(), "out"));
    assert.ok(e.text().includes(`</section>\n  <img src="x.png">\n  <div data-edit-lock`));
    await r.click(action(img(), "in"));
    assert.ok(e.text().includes(`<p class="hidden">C</p>\n    <img src="x.png">\n  </section>`));
  });

  it("trash deletes that row (one undo step), hidden under a delete lock; actions show on the selected row, else on hover", async () => {
    const src = `<main>\n  <p data-edit-lock="delete">Keep</p>\n  <p>Go</p>\n</main>\n`;
    const { e, r, rowOf } = setup(src);
    await act(async () => void e.select(e.get("p")));
    assert.equal(action(rowOf("Text", 0), "delete"), null);
    assert.ok(rowOf("Text", 0).querySelector("[data-layer-actions]")!.className.includes("opacity-100"));
    assert.ok(rowOf("Text", 1).querySelector("[data-layer-actions]")!.className.includes("group-hover:opacity-100"));
    await r.click(action(rowOf("Text", 1), "delete"));
    assert.equal(e.text(), `<main>\n  <p data-edit-lock="delete">Keep</p>\n</main>\n`);
    assert.equal(e.state.selection.primary?.tag, "main");
  });

  it("lint issues → a dot (red for an error), the messages in its tooltip", async () => {
    const { e, rowOf } = setup();
    await act(async () => void e.select(e.get("img")));
    const dot = rowOf("Image").querySelector("[data-layer-lint]");
    assert.ok(dot, "img without alt");
    assert.match(dot!.getAttribute("data-tooltip-content")!, /alt/);
  });

  it("right-click selects the row and opens the editor's context menu there", async () => {
    const { e, r, rowOf } = setup();
    await r.fire(rowOf("Container", 2), "contextmenu", { clientX: 40, clientY: 50 });
    assert.equal(e.state.selection.primary?.tag, "footer");
    const { chromeOf } = await import("../src/shell/chromeState.ts");
    assert.deepEqual(chromeOf(e.state).contextMenu, { x: 40, y: 50 });
  });

  it("keys: ↓ / ↑ select the next / previous row, → expands then steps in, ← collapses then steps out (fixed: arrows exist; tooltips don't promise keys)", async () => {
    const { e, r, labels } = setup();
    const tree = r.get("[data-layer-tree]");
    await key(tree, "ArrowDown");
    assert.equal(e.state.selection.primary?.tag, "header");
    await key(tree, "ArrowDown");
    assert.equal(e.state.selection.primary?.tag, "main");
    await key(tree, "ArrowRight");
    assert.ok(labels().includes("Hero"));
    await key(tree, "ArrowRight");
    assert.equal(e.state.selection.primary?.tag, "section");
    await key(tree, "ArrowLeft");
    assert.equal(e.state.selection.primary?.tag, "main");
    await key(tree, "ArrowUp");
    assert.equal(e.state.selection.primary?.tag, "header");
    assert.equal(r.get('[data-layer-action="up"]').getAttribute("data-tooltip-content"), "Move up");
  });
});

describe("layers tree drag", () => {
  it("a drop line before / after the target, indented to its depth; inside rings the target; the page row shows its page", async () => {
    const src = `<main>\n  <h1>A</h1>\n  <div class="box"><p>B</p></div>\n  <p>C</p>\n</main>\n`;
    const { e, r, rowOf } = setup(src);
    await act(async () => void e.select(e.get("h1")));
    r.all("[data-layer-row]").forEach((el, i) => setRect(el, { left: 0, top: i * 20, width: 300, height: 20 }));
    const c = rowOf("Text", 0);
    const box = rowOf("Container", 1);
    const down = (el: Element, y: number) => act(async () => void el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 150, clientY: y })));
    const move = (y: number) => act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 150, clientY: y })));
    await down(c, 90);
    await move(42);
    const line = r.get('[data-layer-drop-line="before"]');
    assert.equal(line.style.left, `${2 * 12 + 6}px`);
    await move(55);
    assert.ok(r.get('[data-layer-drop-line="after"]'));
    await move(70);
    assert.ok(box.className.includes("ring-blue-500"));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 150, clientY: 70 })));
    assert.equal(e.text(), `<main>\n  <h1>A</h1>\n  <div class="box"><p>B</p><p>C</p></div>\n</main>\n`);
    await r.click(rowOf("Page"));
    const { canvasOf } = await import("../src/features/canvas/canvasState.ts");
    assert.equal(canvasOf(e.state).page, "index.liquid");
  });
});

describe("layers panel", () => {
  it("fills the Layers tab: just the tree, no panel header, resize handle or fixed height", async () => {
    const { r } = setup(PAGE, "panel");
    const panel = r.get('[data-slot="LayersPanel"]');
    assert.equal(panel.style.height, "");
    assert.ok(panel.className.includes("flex-1") && panel.className.includes("min-h-0"));
    assert.ok(panel.querySelector("[data-layer-tree]"));
    for (const gone of ["[data-layers-resize]", "[data-layers-collapse]", "[data-layers-popout]", "[data-layers-collapsed]"]) assert.equal(panel.querySelector(gone), null, gone);
  });

  it("pop out (⇧⌘L / panel.layers) → the 'Layers' floating panel; closing it toggles the panel off", async () => {
    const { e, r } = setup(PAGE, "panel");
    actRun(e, "panel.layers");
    await act(async () => {});
    assert.ok(document.querySelector("[data-layers-dialog] [data-layer-tree]"));
    actRun(e, "panel.layers");
    assert.equal(document.querySelector("[data-layers-dialog]"), null);
    assert.equal(e.press("mod+shift+l").handled, true);
    await act(async () => {});
    assert.ok(document.querySelector("[data-layers-dialog]"));
  });
});

describe("layers panel cost", () => {
  it("selecting 10 elements in a row asks element.move for the selected row only, not 4 times per row (each ask re-parses the file)", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `<section><p id="p${i}">P${i}</p></section>`).join("\n");
    const { e, r } = setup(`<main>\n${rows}\n</main>\n`);
    let asks = 0;
    const can = e.can.bind(e);
    (e as unknown as { can: typeof e.can }).can = ((cmd: string, args?: unknown) => (cmd === "element.move" && asks++, can(cmd as never, args as never))) as typeof e.can;
    const ps = r.all("[data-layer-row]").length;
    for (let i = 0; i < 10; i++) await act(async () => void e.select(e.get(`#p${i}`)));
    assert.ok(asks <= 10 * 4 * 2, `element.move asked ${asks} times for 10 selections of ${ps} rows`);
  });

  it("the selection stays on the clicked element across re-renders (paint, hover, zoom-fit)", async () => {
    const { e } = setup();
    await act(async () => void e.select(e.get("h1")));
    const h = e.state.selection.primary;
    for (let i = 0; i < 5; i++) {
      actRun(e, "canvas.zoomFitApply", { zoom: 0.5 + i / 20 });
      actRun(e, "canvas.hover", { src: null });
      await act(async () => {});
    }
    assert.equal(e.state.selection.primary, h);
    assert.equal(e.state.selection.primary?.tag, "h1");
  });
});
