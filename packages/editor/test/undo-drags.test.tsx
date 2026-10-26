import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { historyField } from "@pagehub/engine";
import { PADDING_DWELL_MS } from "../src/features/canvas/geometry.ts";
import { fireIn, mountCanvas, setRect, wait } from "./canvasHarness.tsx";
import type { Rendered } from "./harness.tsx";

const R = { left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 };
let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

async function drag(el: Element, from: { x: number; y: number }, to: { x: number; y: number }, steps = 6) {
  await fireIn(el, "pointerdown", { button: 0, buttons: 1, clientX: from.x, clientY: from.y });
  for (let i = 1; i <= steps; i++) {
    const at = { clientX: from.x + ((to.x - from.x) * i) / steps, clientY: from.y + ((to.y - from.y) * i) / steps };
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, ...at })));
  }
  await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: to.x, clientY: to.y })));
}

async function selectWithLayout(r: Rendered, doc: Document, selector: string) {
  setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
  setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
  const el = doc.querySelector(selector)!;
  setRect(el, R);
  await fireIn(el, "mousedown");
  return el as HTMLElement;
}

describe("handle drags are one undo step", () => {
  const setup = async () => {
    const m = await mountCanvas();
    cleanup = m.r.unmount;
    return { ...m, steps: () => m.e.state.field(historyField).done.length, before: m.e.text() };
  };

  it("padding: many pointer moves, one write on pointer-up", async () => {
    const { r, doc, e, steps, before } = await setup();
    const main = await selectWithLayout(r, doc, "main");
    await fireIn(main, "pointermove", { clientX: 150, clientY: 104 });
    await wait(PADDING_DWELL_MS + 20);
    await drag(r.get('[data-zone="padding"]'), { x: 150, y: 104 }, { x: 150, y: 128 });
    assert.match(e.get("main").attr("class")!, /\bpt-6\b/);
    assert.equal(steps(), 1);
    e.undo();
    assert.equal(e.text(), before);
    await wait(120); // let the frame's re-render timers finish before teardown
  });

  it("gap: many pointer moves, one write on pointer-up", async () => {
    const { r, doc, e, steps, before } = await setup();
    const ul = await selectWithLayout(r, doc, "ul");
    [...ul.querySelectorAll("li")].forEach((li, i) => setRect(li, { left: 100 + i * 58, top: 110, width: 50, height: 30 }));
    ul.style.display = "flex";
    ul.style.columnGap = "8px";
    await fireIn(ul, "pointermove", { clientX: 154, clientY: 125 });
    await drag(r.get('[data-zone="gap"]'), { x: 154, y: 125 }, { x: 162, y: 125 });
    assert.match(e.get("ul").attr("class")!, /\bgap-4\b/);
    assert.equal(steps(), 1);
    e.undo();
    assert.equal(e.text(), before);
    await wait(120); // let the frame's re-render timers finish before teardown
  });

  it("rotate: many pointer moves, one write on pointer-up", async () => {
    const { r, doc, e, steps, before } = await setup();
    const img = await selectWithLayout(r, doc, "img");
    await fireIn(img, "pointermove", { clientX: 105, clientY: 195 });
    await drag(r.get('[data-zone="rotate"]'), { x: 105, y: 195 }, { x: 140, y: 235 });
    assert.match(e.get("img").attr("class")!, /rotate-\[-?\d+deg\]/);
    assert.equal(steps(), 1);
    e.undo();
    assert.equal(e.text(), before);
    await wait(120); // let the frame's re-render timers finish before teardown
  });
});
