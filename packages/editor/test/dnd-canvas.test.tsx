import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { canvasEditor, fireIn, mountCanvas, rendered, setRect, wait } from "./canvasHarness.tsx";
import type { Rendered } from "./harness.tsx";
import { DEFAULT_LAYOUT_CLASSES as C } from "../../engine/src/kits/html/dnd/layout.ts";
import { dragSessionOf } from "../src/features/dnd/dragSession.ts";
import { PREVIEW_ID } from "../src/features/dnd/dragFlags.ts";
import { CANVAS_CSS } from "../src/features/canvas/canvasCss.ts";

const PAGE = `<main class="p-4">
  <h1>A</h1>
  <p>B</p>
  <p>C</p>
</main>
`;

let mounted: Rendered | null = null;
afterEach(async () => {
  await wait(10);
  mounted?.unmount();
  mounted = null;
});

const W = 800;
async function mount(page: string, layout: (doc: Document) => void) {
  const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": page }));
  mounted = r;
  setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
  setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
  layout(doc);
  return { r, doc, e };
}

/** Stack the rendered children of `parent` vertically, 40px tall with 10px gaps, from `top`. */
function stack(parent: HTMLElement, top: number, box = { left: 0, width: W }) {
  let y = top;
  for (const el of [...parent.children] as HTMLElement[]) {
    setRect(el, { left: box.left, top: y, width: box.width, height: 40 });
    y += 50;
  }
  setRect(parent, { left: box.left, top: top - 10, width: box.width, height: y - top + 10 });
}

const move = (x: number, y: number, init: PointerEventInit = {}) => act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: x, clientY: y, ...init })));
const up = (x: number, y: number, init: PointerEventInit = {}) => act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, ...init })));

describe("canvas drag and drop", () => {
  it("press-drag a rendered element: flags, flat tile, preview and indicator while dragging; the drop is one transaction (exact diff)", async () => {
    const { r, doc, e } = await mount(PAGE, (d) => stack(d.querySelector("main")!, 10));
    const c = doc.querySelectorAll("p")[1]!;
    await fireIn(c, "pointerdown", { clientX: 400, clientY: 130, button: 0 });
    await move(400, 128);
    assert.equal(doc.body.hasAttribute("data-is-dragging"), false, "no drag under the 4px threshold");
    await move(400, 15);
    assert.equal(doc.body.getAttribute("data-is-dragging"), "true");
    assert.equal(doc.body.getAttribute("data-dragging-type"), "p");
    assert.equal(c.getAttribute("data-dragging"), "true");
    assert.ok(r.container.ownerDocument.getElementById(PREVIEW_ID), "preview clone (in the host document) follows the pointer");
    assert.equal(r.get("[data-canvas-frame]").style.pointerEvents, "none");
    assert.ok(r.container.querySelector("[data-drop-parent]"), "parent outline");
    assert.ok(r.container.querySelector('[data-drop-bar="horizontal"]'), "column bar");
    assert.equal(r.container.querySelectorAll("[data-drop-cap]").length, 2, "end caps on a bar ≥28px");
    assert.ok(r.container.querySelector("[data-drop-band]"), "page parent: the 40px band");
    assert.ok(r.container.querySelector("[data-drop-ghost]"));
    await fireIn(doc.querySelector("h1")!, "mouseover");
    assert.equal(e.state.selection.hover, null, "hover is suppressed while dragging");
    await up(400, 15);
    assert.equal(e.text(), `<main class="p-4">\n  <p>C</p>\n  <h1>A</h1>\n  <p>B</p>\n</main>\n`);
    assert.equal(doc.body.hasAttribute("data-is-dragging"), false);
    assert.equal(r.container.querySelector("[data-drop-indicator]"), null);
    e.undo();
    assert.equal(e.text(), PAGE, "one undo restores the page");
    await rendered(r, 3);
  });

  it("Shift during the drag copies; a release outside the canvas drops nothing", async () => {
    const { doc, e } = await mount(PAGE, (d) => stack(d.querySelector("main")!, 10));
    const b = doc.querySelectorAll("p")[0]!;
    await fireIn(b, "pointerdown", { clientX: 400, clientY: 80, button: 0 });
    await move(400, 140, { shiftKey: true });
    assert.ok(doc.body.hasAttribute("data-ph-drag-copy"), "copy mode keeps the source as it is");
    await up(400, 140, { shiftKey: true });
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n  <p>C</p>\n  <p>B</p>\n</main>\n`);
    const doc2 = await rendered(mounted!, 2);
    stack(doc2.querySelector("main")!, 10);
    await fireIn(doc2.querySelectorAll("p")[0]!, "pointerdown", { clientX: 400, clientY: 80, button: 0 });
    await move(1200, 15);
    assert.equal(dragSessionOf(e).get()?.plan, null, "outside the canvas: no plan");
    await up(1200, 15);
    assert.equal(e.text().match(/<p>B<\/p>/g)?.length, 2, "nothing moved");
  });

  it("an invalid target (drop-in lock) paints the indicator red and drops nothing", async () => {
    const page = `<main class="p-4">\n  <div data-edit-lock="drop-in" class="box">\n    <span>x</span>\n  </div>\n  <p>B</p>\n</main>\n`;
    const { r, doc, e } = await mount(page, (d) => {
      stack(d.querySelector("main")!, 10);
      setRect(d.querySelector("div")!, { left: 0, top: 0, width: W, height: 200 });
      setRect(d.querySelector("span")!, { left: 20, top: 20, width: 100, height: 40 });
      setRect(d.querySelector("p")!, { left: 0, top: 220, width: W, height: 40 });
    });
    await fireIn(doc.querySelector("p")!, "pointerdown", { clientX: 400, clientY: 240, button: 0 });
    await move(400, 100);
    assert.ok(r.container.querySelector("[data-drop-invalid]"));
    assert.ok(r.get("[data-drop-parent]").style.outline.includes("rgb(239 68 68)"), "red outline");
    await up(400, 100);
    assert.equal(e.text(), page);
  });

  it("beside: the edge band of a wide child in a column shows the bar + 'Create split'; the drop makes a Row", async () => {
    const page = `<main class="p-4">\n  <div class="col">\n    <h2 class="card">X</h2>\n    <p>B</p>\n    <p>Z</p>\n  </div>\n</main>\n`;
    const { r, doc, e } = await mount(page, (d) => {
      const col = d.querySelector("div.col") as HTMLElement;
      stack(col, 20);
      setRect(d.querySelector("h2.card")!, { left: 0, top: 20, width: W, height: 200 });
      setRect(d.querySelector("p")!, { left: 0, top: 240, width: W, height: 40 });
      setRect(d.querySelectorAll("p")[1]!, { left: 0, top: 290, width: W, height: 40 });
      setRect(col, { left: 0, top: 10, width: W, height: 330 });
      setRect(d.querySelector("main")!, { left: 0, top: 0, width: W, height: 300 });
    });
    await fireIn(doc.querySelector("p")!, "pointerdown", { clientX: 400, clientY: 260, button: 0 });
    await move(30, 120);
    assert.equal(r.get("[data-beside-bar]").getAttribute("data-beside-bar"), "left");
    assert.equal(r.get("[data-beside-label]").textContent, "Create split");
    await up(30, 120);
    assert.equal(e.text(), `<main class="p-4">\n  <div class="col">\n    <div class="${C.row}">\n      <div class="${C.item}">\n        <p>B</p>\n      </div>\n      <div class="${C.item}">\n        <h2 class="card">X</h2>\n      </div>\n    </div>\n    <p>Z</p>\n  </div>\n</main>\n`);
  });

  it("pages and footers don't drag", async () => {
    const { doc } = await mount(`<main class="p-4">\n  <p>B</p>\n</main>\n<footer>F</footer>\n`, (d) => {
      setRect(d.querySelector("main")!, { left: 0, top: 0, width: W, height: 100 });
      setRect(d.querySelector("footer")!, { left: 0, top: 100, width: W, height: 40 });
    });
    await fireIn(doc.querySelector("footer")!, "pointerdown", { clientX: 400, clientY: 120, button: 0 });
    await move(400, 20);
    assert.equal(doc.body.hasAttribute("data-is-dragging"), false);
    await up(400, 20);
  });
  it("a row parent shows the 3px vertical line at .55 with 10×2 caps (≥24px tall)", async () => {
    const page = `<main class="p-4">\n  <nav class="flex">\n    <a>1</a>\n    <a>2</a>\n    <a>3</a>\n  </nav>\n</main>\n`;
    const { r, doc, e } = await mount(page, (d) => {
      const nav = d.querySelector("nav") as HTMLElement;
      nav.style.display = "flex";
      nav.style.flexDirection = "row";
      setRect(d.querySelector("main")!, { left: 0, top: 0, width: W, height: 100 });
      setRect(nav, { left: 0, top: 0, width: W, height: 40 });
      d.querySelectorAll("a").forEach((a, i) => setRect(a, { left: i * 110, top: 5, width: 100, height: 30 }));
    });
    const third = doc.querySelectorAll("a")[2]!;
    await fireIn(third, "pointerdown", { clientX: 250, clientY: 20, button: 0 });
    await move(20, 20);
    const bar = r.get('[data-drop-bar="vertical"]');
    assert.equal(bar.style.opacity, "0.55");
    assert.equal(bar.querySelectorAll("[data-drop-cap]").length, 2);
    await up(20, 20);
    assert.equal(e.text(), page.replace("    <a>1</a>\n    <a>2</a>\n    <a>3</a>", "    <a>3</a>\n    <a>1</a>\n    <a>2</a>"));
  });

  it("dragging a section marks the body (pages, headers and footers get the dashed outline)", async () => {
    const page = `<main class="p-4">\n  <section>S</section>\n  <p>B</p>\n</main>\n`;
    const { doc } = await mount(page, (d) => stack(d.querySelector("main")!, 10));
    await fireIn(doc.querySelector("section")!, "pointerdown", { clientX: 400, clientY: 30, button: 0 });
    await move(400, 90);
    assert.equal(doc.body.getAttribute("data-dragging-type"), "section");
    assert.match(CANVAS_CSS, /body\[data-dragging-type="section"\] :is\(main, header, footer\) \{ outline: 2px dashed currentColor !important; outline-offset: -2px; \}/);
    await up(400, 90);
  });

  it("within 10px of a container's border the drop goes beside it, in its parent; deeper inside it drops into the container", async () => {
    const page = `<main class="p-4">\n  <div class="box">\n    <span>x</span>\n  </div>\n  <p>B</p>\n</main>\n`;
    const layout = (d: Document) => {
      setRect(d.querySelector("main")!, { left: 0, top: 0, width: W, height: 400 });
      setRect(d.querySelector("div")!, { left: 0, top: 0, width: W, height: 200 });
      setRect(d.querySelector("span")!, { left: 20, top: 20, width: 100, height: 40 });
      setRect(d.querySelector("p")!, { left: 0, top: 220, width: W, height: 40 });
    };
    const { doc, e } = await mount(page, layout);
    await fireIn(doc.querySelector("p")!, "pointerdown", { clientX: 400, clientY: 240, button: 0 });
    await move(400, 4);
    await up(400, 4);
    assert.equal(e.text(), `<main class="p-4">\n  <p>B</p>\n  <div class="box">\n    <span>x</span>\n  </div>\n</main>\n`);
    e.undo();
    const doc2 = await rendered(mounted!, 3);
    layout(doc2);
    await fireIn(doc2.querySelector("p")!, "pointerdown", { clientX: 400, clientY: 240, button: 0 });
    await move(400, 150);
    await up(400, 150);
    assert.equal(e.text(), `<main class="p-4">\n  <div class="box">\n    <span>x</span>\n    <p>B</p>\n  </div>\n</main>\n`);
  });

  it("a sideways drag in the same column parent aligns on drop (self-end), in the same transaction as the move", async () => {
    const page = `<main class="p-4">\n  <div class="flex flex-col">\n    <h2>A</h2>\n    <p>B</p>\n  </div>\n</main>\n`;
    const { doc, e } = await mount(page, (d) => {
      const col = d.querySelector("div") as HTMLElement;
      col.style.display = "flex";
      col.style.flexDirection = "column";
      setRect(d.querySelector("main")!, { left: 0, top: 0, width: W, height: 300 });
      setRect(col, { left: 0, top: 0, width: W, height: 300 });
      setRect(d.querySelector("h2")!, { left: 0, top: 20, width: 200, height: 40 });
      setRect(d.querySelector("p")!, { left: 0, top: 70, width: 200, height: 40 });
    });
    await fireIn(doc.querySelector("p")!, "pointerdown", { clientX: 100, clientY: 90, button: 0 });
    await move(700, 100);
    await up(700, 100);
    assert.equal(e.text(), page.replace("<p>B</p>", `<p class="self-end">B</p>`));
    e.undo();
    assert.equal(e.text(), page);
    await rendered(mounted!, 3);
  });
});

