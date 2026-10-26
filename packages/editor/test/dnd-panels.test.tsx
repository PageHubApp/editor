import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import type { NodeHandle } from "@pagehub/engine";
import type { InsertArgs } from "@pagehub/engine/kits";
import { canvasEditor, mountCanvas, setRect } from "./canvasHarness.tsx";
import { render, withEditor, type Rendered } from "./harness.tsx";
import { useEditorStore } from "../src/react/bindings.tsx";
import { useLayerDrag, dropLineStyle } from "../src/features/dnd/useLayerDrag.ts";
import { useInsertDrag } from "../src/features/dnd/useInsertDrag.ts";

const PAGE = `<main class="p-4">
  <h1>A</h1>
  <div class="box">
    <p>B</p>
  </div>
  <p>C</p>
</main>
`;

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
});

const down = (el: Element, x: number, y: number) => act(async () => void el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y })));
const move = (x: number, y: number) => act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: x, clientY: y })));
const up = (x: number, y: number) => act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y })));

/** A bare layers list: every element of the page, one 20px row each, indented 16px per level. */
function Layers() {
  const store = useEditorStore();
  const { row, indicator } = useLayerDrag();
  const list: [NodeHandle, number][] = [];
  const walk = (h: NodeHandle, d: number) => {
    list.push([h, d]);
    for (const c of h.children()) if (c.kind === "element") walk(c, d + 1);
  };
  walk(store.find("index.liquid", "main")[0]!, 0);
  return (
    <div data-layers="">
      {list.map(([h, d]) => (
        <div key={`${h.range.from}`} {...row(h, d)} data-tag={h.tag}>
          {h.tag}
        </div>
      ))}
      {indicator && <span data-ind={indicator.zone} data-depth={indicator.depth} data-valid={String(indicator.valid)} />}
    </div>
  );
}

async function layers() {
  const e = canvasEditor({ "index.liquid": PAGE });
  const r = render(withEditor(e, <Layers />));
  open.push(r);
  r.all("[data-layer-row]").forEach((el, i) => setRect(el, { left: 0, top: i * 20, width: 300, height: 20 }));
  return { e, r, rowOf: (tag: string, i = 0) => r.all(`[data-tag="${tag}"]`)[i]! };
}

describe("layers panel drag", () => {
  it("drag a row: 40% opacity while dragging; before the target (top half of a leaf) → one move, exact diff", async () => {
    const { e, rowOf } = await layers();
    const c = rowOf("p", 1);
    await down(c, 100, 90);
    await move(100, 25);
    assert.equal(c.style.opacity, "0.4");
    assert.equal(document.querySelector("[data-ind]")?.getAttribute("data-ind"), "before");
    await up(100, 25);
    assert.equal(e.text(), `<main class="p-4">\n  <p>C</p>\n  <h1>A</h1>\n  <div class="box">\n    <p>B</p>\n  </div>\n</main>\n`);
  });

  it("inside a container (middle 60%) → appended as its last child", async () => {
    const { e, rowOf } = await layers();
    await down(rowOf("p", 1), 100, 90);
    await move(100, 50);
    assert.equal(rowOf("div").getAttribute("data-drop-inside"), "");
    await up(100, 50);
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <div class="box">\n    <p>B</p>\n    <p>C</p>\n  </div>\n</main>\n`);
  });

  it("near the left edge (depth·16+8+40px) the drop goes after the parent, the line indented to the parent's depth", async () => {
    const { e, rowOf } = await layers();
    await down(rowOf("h1"), 100, 30);
    await move(30, 70);
    assert.equal(document.querySelector("[data-ind]")?.getAttribute("data-ind"), "after-parent");
    assert.equal(document.querySelector("[data-ind]")?.getAttribute("data-depth"), "1");
    await up(30, 70);
    assert.equal(e.text(), `<main class="p-4">\n  <div class="box">\n    <p>B</p>\n  </div>\n  <h1>A</h1>\n  <p>C</p>\n</main>\n`);
  });

  it("no indicator over the dragged row or its descendants; off the rows clears it; a rejected drop moves nothing", async () => {
    const { e, rowOf } = await layers();
    await down(rowOf("div"), 100, 50);
    await move(100, 70);
    assert.equal(document.querySelector("[data-ind]"), null, "own descendant");
    await move(500, 500);
    assert.equal(document.querySelector("[data-ind]"), null, "off the rows");
    await up(500, 500);
    assert.equal(e.text(), PAGE);
    const style = dropLineStyle({ top: 40, bottom: 60 }, { zone: "after", depth: 2 } as never);
    assert.deepEqual(style, { position: "absolute", left: 40, right: 0, top: 59, height: 2 });
  });
});

function Tile({ insert }: { insert: InsertArgs }) {
  const { onPointerDown, pressed } = useInsertDrag(insert);
  return <button type="button" data-tile="" data-pressed={pressed ? "" : undefined} onPointerDown={onPointerDown}>Tile</button>;
}

describe("insert panel drag", () => {
  it("a tile turns accent on press; dragging it onto the canvas plans like a canvas drag and inserts there (one transaction)", async () => {
    const page = `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n</main>\n`;
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": page }));
    open.push(r);
    setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(doc.querySelector("main")!, { left: 0, top: 0, width: 800, height: 100 });
    setRect(doc.querySelector("h1")!, { left: 0, top: 0, width: 800, height: 40 });
    setRect(doc.querySelector("p")!, { left: 0, top: 50, width: 800, height: 40 });
    const t = render(withEditor(e, <Tile insert={{ snippet: "<span>new</span>" }} />));
    open.push(t);
    const tile = t.get("[data-tile]");
    await down(tile, 1100, 10);
    assert.equal(tile.getAttribute("data-pressed"), "");
    await move(400, 85);
    assert.ok(r.container.querySelector('[data-drop-bar="horizontal"]'));
    assert.ok(r.container.querySelector("[data-drop-ghost]"), "a 120×40 ghost for new markup");
    await up(400, 85);
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n  <span>new</span>\n</main>\n`);
    assert.equal(tile.getAttribute("data-pressed"), null);
  });

  it("the Automatic tile morphs by where it lands; released off the canvas nothing is inserted", async () => {
    const page = `<main class="p-4">\n  <h1>A</h1>\n</main>\n`;
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": page }));
    open.push(r);
    setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(doc.querySelector("main")!, { left: 0, top: 0, width: 800, height: 100 });
    setRect(doc.querySelector("h1")!, { left: 0, top: 0, width: 800, height: 40 });
    const t = render(withEditor(e, <Tile insert={{ automatic: true }} />));
    open.push(t);
    await down(t.get("[data-tile]"), 1100, 10);
    await move(1200, 900);
    await up(1200, 900);
    assert.equal(e.text(), page);
    await down(t.get("[data-tile]"), 1100, 10);
    await move(400, 80);
    await up(400, 80);
    assert.match(e.text(), /<h1>A<\/h1>\n  <section class="[^"]+">\n    <div class="[^"]+"><\/div>\n  <\/section>\n<\/main>/);
  });
});
