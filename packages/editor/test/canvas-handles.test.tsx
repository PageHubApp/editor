import "./setup.ts";
import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { GAP_COOLDOWN_MS, containerZone, edgeZone, gapAt, gapToken, gapsBetween, heightToken, paddingAfterDrag, paddingToken, projectDelta, rotateAngle, rotateDegrees, rotateToken, snapSpacing, widthToken, PADDING_DWELL_MS, SPACING_SCALE } from "../src/features/canvas/geometry.ts";
import { fireIn, mountCanvas, setRect, wait } from "./canvasHarness.tsx";
import { actRun } from "./harness.tsx";
import type { Rendered } from "./harness.tsx";

const R = { left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 };

let cleanup: (() => void) | null = null;
// Unmounting the canvas leaves iframe page-load tasks and the handle timers (dwell, cooldown) in happy-dom's queue;
// drain them here so none fires after setup.ts unregisters the globals ("window is not defined").
afterEach(async () => {
  cleanup?.();
  cleanup = null;
  await act(async () => void (await (window as unknown as { happyDOM: { waitUntilComplete(): Promise<void> } }).happyDOM.waitUntilComplete()));
});

/** Pointer gesture on a host element: down on it, moves and up on window (the drag rule). */
async function drag(el: Element, from: { x: number; y: number }, to: { x: number; y: number }, init: PointerEventInit = {}) {
  await fireIn(el, "pointerdown", { button: 0, buttons: 1, clientX: from.x, clientY: from.y, ...init });
  await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: to.x, clientY: to.y, ...init })));
  await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: to.x, clientY: to.y, ...init })));
}

/** Frame at (0,0) of the host, zoom 1, the selected element at R. */
async function selectWithLayout(r: Rendered, doc: Document, selector: string) {
  setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
  setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
  const el = doc.querySelector(selector)!;
  setRect(el, R);
  await fireIn(el, "mousedown");
  return el as HTMLElement;
}

describe("handles: geometry", () => {
  it("edge resize zone: within 6px of the right or bottom edge (rotation-aware); 18px bottom-left radius is rotate", () => {
    assert.equal(edgeZone(R, 296, 150), "right");
    assert.equal(edgeZone(R, 306, 150), "right");
    assert.equal(edgeZone(R, 307, 150), null);
    assert.equal(edgeZone(R, 200, 196), "bottom");
    assert.equal(edgeZone(R, 110, 190), "rotate");
    assert.equal(edgeZone(R, 200, 150), null);
    // rotated 90°: the unrotated right edge now faces down
    assert.equal(edgeZone(R, 200, 150 + 100, 90), "right");
    assert.equal(Math.round(projectDelta(0, 10, "right", 90)), 10);
  });

  it("container zones: 12px inside an edge = padding (top, bottom, left, right); 0–8px outside right/bottom = resize; 400ms dwell", () => {
    assert.deepEqual(containerZone(R, 150, 105), { side: "top", mode: "padding" });
    assert.deepEqual(containerZone(R, 150, 195), { side: "bottom", mode: "padding" });
    assert.deepEqual(containerZone(R, 105, 150), { side: "left", mode: "padding" });
    assert.deepEqual(containerZone(R, 295, 150), { side: "right", mode: "padding" });
    assert.deepEqual(containerZone(R, 305, 150), { side: "right", mode: "resize" });
    assert.deepEqual(containerZone(R, 150, 208), { side: "bottom", mode: "resize" });
    assert.equal(containerZone(R, 150, 209), null);
    assert.equal(containerZone(R, 200, 150), null);
    assert.equal(PADDING_DWELL_MS, 400);
  });

  it("padding drag: inward grows; snaps to the spacing map (0…384, >404 unsnapped); writes p{t|b|l|r}-{n} or -[Npx]", () => {
    assert.equal(paddingAfterDrag("left", 16, 10, 0), 26);
    assert.equal(paddingAfterDrag("right", 16, 10, 0), 6);
    assert.equal(paddingAfterDrag("top", 0, 0, -5), 0);
    assert.equal(SPACING_SCALE.length, 35);
    assert.equal(snapSpacing(17), 16);
    assert.equal(snapSpacing(500), 500);
    assert.deepEqual(paddingToken("top", 17), { group: "pt", token: "pt-4", px: 16 });
    assert.deepEqual(paddingToken("left", 1), { group: "pl", token: "pl-px", px: 1 });
    assert.deepEqual(paddingToken("bottom", 420), { group: "pb", token: "pb-[420px]", px: 420 });
  });

  it("width drag snaps to w-1/4 … w-full of the parent; height to h-{spacing} or h-[Npx]; Alt writes raw px (fix-table: edge resize snaps)", () => {
    assert.equal(widthToken(240, 1000).token, "w-1/4");
    assert.equal(widthToken(340, 1000).token, "w-1/3");
    assert.equal(widthToken(980, 1000).token, "w-full");
    assert.equal(widthToken(340, 1000, true).token, "w-[340px]");
    assert.equal(heightToken(63).token, "h-16");
    assert.equal(heightToken(500).token, "h-[500px]");
    assert.equal(heightToken(63, true).token, "h-[63px]");
  });

  it("gap: 35-step scale gap-0 … gap-96; counts only gaps matching the computed gap within max(20, gap·0.5); hit within 40px", () => {
    assert.deepEqual(gapToken(15.5), { token: "gap-4", px: 16 });
    assert.equal(gapToken(1000).token, "gap-96");
    const kids = [
      { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 },
      { left: 116, top: 0, right: 200, bottom: 50, width: 84, height: 50 },
      { left: 400, top: 0, right: 450, bottom: 50, width: 50, height: 50 },
    ];
    const gaps = gapsBetween(kids, "row", 16);
    assert.equal(gaps.length, 1, "the 200px justify gap doesn't count");
    assert.deepEqual(gaps[0], { x: 108, y: 25, size: 16 });
    assert.equal(gapAt(gaps, 108, 60)?.size, 16);
    assert.equal(gapAt(gaps, 108, 70), null);
  });

  it("rotate: atan2 around the centre; Shift snaps to 15°; writes rotate-[Ndeg], 0° removes it", () => {
    const c = { x: 0, y: 0 };
    assert.equal(rotateAngle(c, { x: 10, y: 0 }, { x: 0, y: 10 }, 0, false), 90);
    assert.equal(rotateAngle(c, { x: 10, y: 0 }, { x: 10, y: 2 }, 0, false), 11);
    assert.equal(rotateAngle(c, { x: 10, y: 0 }, { x: 10, y: 2 }, 0, true), 15);
    assert.equal(rotateToken(15), "rotate-[15deg]");
    assert.equal(rotateToken(0), null);
    assert.equal(rotateDegrees("-rotate-45"), -45);
    assert.equal(rotateDegrees("rotate-[12deg]"), 12);
  });
});

describe("handles: on the canvas", () => {
  it("edge drag on a selected element writes one width class in the current breakpoint scope; live preview is inline and removed", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.view", { view: "md" });
    const img = await selectWithLayout(r, doc, "img");
    (img.parentElement as unknown as { getBoundingClientRect(): unknown }).getBoundingClientRect = () => ({ ...R, left: 0, width: 1000, right: 1000 });
    await fireIn(img, "pointermove", { clientX: 298, clientY: 150 });
    const zone = r.get('[data-zone="edge"]');
    assert.equal(zone.getAttribute("data-zone-side"), "right");
    assert.equal(doc.body.getAttribute("data-ph-edge"), "right");
    const before = e.text();
    await drag(zone, { x: 298, y: 150 }, { x: 348, y: 150 });
    assert.equal(img.style.width, "");
    assert.notEqual(e.text(), before);
    assert.match(e.get("img").attr("class")!, /\bmd:w-1\/4\b/);
    assert.match(e.get("img").attr("class")!, /\bw-10\b/, "base layer untouched");
    e.undo();
    assert.equal(e.text(), before, "one undo step");
  });

  it("rotate: drag within the bottom-left corner writes rotate-[Ndeg]; Shift snaps to 15°", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const img = await selectWithLayout(r, doc, "img");
    await fireIn(img, "pointermove", { clientX: 105, clientY: 195 });
    assert.equal(doc.body.hasAttribute("data-ph-rotate"), true);
    // centre (200,150); start (105,195) → (130, 230): a little clockwise
    await drag(r.get('[data-zone="rotate"]'), { x: 105, y: 195 }, { x: 140, y: 235 }, { shiftKey: true });
    const cls = e.get("img").attr("class")!;
    const m = /rotate-\[(-?\d+)deg\]/.exec(cls);
    assert.ok(m, cls);
    assert.equal(Math.abs(Number(m![1]) % 15), 0);
  });

  it("container padding zone appears after a 400ms dwell; dragging inward writes p{side}-{n}", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const main = await selectWithLayout(r, doc, "main");
    await fireIn(main, "pointermove", { clientX: 150, clientY: 104 });
    assert.equal(r.all("[data-zone]").length, 0, "no zone before the dwell");
    await wait(PADDING_DWELL_MS + 20);
    const zone = r.get('[data-zone="padding"]');
    assert.equal(zone.getAttribute("data-zone-side"), "top");
    assert.match(zone.className, /rgba\(147,196,125,\.3\)/);
    await drag(zone, { x: 150, y: 104 }, { x: 150, y: 128 });
    assert.match(e.get("main").attr("class")!, /\bpt-6\b/);
    assert.match(e.get("main").attr("class")!, /\bp-4\b/);
  });

  it("container resize zone (8px outside the right edge) snaps width to a parent fraction", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const main = await selectWithLayout(r, doc, "main");
    (main.parentElement as unknown as { getBoundingClientRect(): unknown }).getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800 });
    await fireIn(doc.body, "pointermove", { clientX: 304, clientY: 150 });
    await wait(PADDING_DWELL_MS + 20);
    const zone = r.get('[data-zone="resize"]');
    assert.match(zone.className, /rgba\(59,130,246,\.2\)/);
    await drag(zone, { x: 304, y: 150 }, { x: 204, y: 150 });
    assert.match(e.get("main").attr("class")!, /\bw-1\/4\b/);
  });

  it("gap marker on a selected flex container within 40px of a gap centre; drag snaps and writes gap-N", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const ul = await selectWithLayout(r, doc, "ul");
    const lis = [...ul.querySelectorAll("li")];
    lis.forEach((li, i) => setRect(li, { left: 100 + i * 58, top: 110, width: 50, height: 30 }));
    ul.style.display = "flex";
    ul.style.columnGap = "8px";
    await fireIn(ul, "pointermove", { clientX: 154, clientY: 125 });
    const zone = r.get('[data-zone="gap"]');
    assert.equal(zone.getAttribute("data-zone-side"), "row");
    assert.match(zone.className, /bg-blue-500\/\[\.18\]/);
    assert.ok(parseFloat(zone.style.width) >= 8, "at least 8px thick");
    await drag(zone, { x: 154, y: 125 }, { x: 162, y: 125 });
    assert.match(e.get("ul").attr("class")!, /\bgap-4\b/);
    assert.doesNotMatch(e.get("ul").attr("class")!, /\bgap-2\b/);
  });

  it("class writes are prefixed by the view's breakpoint and dark: when dark-edit is on", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "ui.set", { view: "lg", dark: true });
    const img = await selectWithLayout(r, doc, "img");
    await fireIn(img, "pointermove", { clientX: 200, clientY: 198 });
    await drag(r.get('[data-zone="edge"]'), { x: 200, y: 198 }, { x: 200, y: 262 });
    assert.match(e.get("img").attr("class")!, /\blg:dark:h-40\b/);
  });
});

describe("handles: hover feedback", () => {
  it("edge hover: body[data-ph-edge] forces the resize cursor; 2px blue edge line, 6px white dot and an 'Npx' pill", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const img = await selectWithLayout(r, doc, "img");
    await fireIn(img, "pointermove", { clientX: 200, clientY: 199 });
    assert.equal(doc.body.getAttribute("data-ph-edge"), "bottom");
    assert.match(doc.getElementById("pagehub-canvas-chrome")!.textContent!, /body\[data-ph-edge="bottom"\], body\[data-ph-edge="bottom"\] \* \{ cursor: ns-resize !important; \}/);
    assert.match(r.get("[data-edge-line]").className, /\bh-0\.5\b.*bg-blue-500|bg-blue-500.*\bh-0\.5\b/);
    assert.match(r.get("[data-edge-dot]").className, /size-1\.5.*bg-white|bg-white.*size-1\.5/);
    assert.equal(r.get("[data-edge-pill]").textContent, "100px");
    await fireIn(img, "pointermove", { clientX: 200, clientY: 150 });
    assert.equal(doc.body.hasAttribute("data-ph-edge"), false);
  });

  it("containers never get edge resize / rotate (padding zones instead); edge resize is for other elements", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const main = await selectWithLayout(r, doc, "main");
    await fireIn(main, "pointermove", { clientX: 298, clientY: 150 });
    await fireIn(main, "pointermove", { clientX: 105, clientY: 195 });
    assert.equal(r.all('[data-zone="edge"], [data-zone="rotate"]').length, 0);
    assert.equal(doc.body.hasAttribute("data-ph-edge"), false);
  });

  it("gap marker: no dwell; 35% fill while dragging; hidden for 250ms after a gap drag", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const ul = await selectWithLayout(r, doc, "ul");
    [...ul.querySelectorAll("li")].forEach((li, i) => setRect(li, { left: 100 + i * 58, top: 110, width: 50, height: 30 }));
    ul.style.display = "flex";
    ul.style.columnGap = "8px";
    await fireIn(ul, "pointermove", { clientX: 154, clientY: 125 });
    const zone = r.get('[data-zone="gap"]');
    await fireIn(zone, "pointerdown", { button: 0, buttons: 1, clientX: 154, clientY: 125 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 160, clientY: 125 })));
    assert.match(r.get('[data-zone="gap"]').className, /bg-blue-500\/\[\.35\]/);
    assert.equal(r.get("[data-handle-readout]").textContent, "14px");
    // The cooldown reads Date.now(): freeze it, so machine load between the drag and the check cannot outlast 250ms.
    mock.timers.enable({ apis: ["Date"] });
    try {
      await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 160, clientY: 125 })));
      await fireIn(ul, "pointermove", { clientX: 154, clientY: 125 });
      assert.equal(r.all('[data-zone="gap"]').length, 0, "cooldown");
      mock.timers.tick(GAP_COOLDOWN_MS + 20);
    } finally {
      mock.timers.reset();
    }
    await wait(10);
    // the write re-rendered the canvas: lay out the new list the same way
    const ul2 = doc.querySelector<HTMLElement>("ul")!;
    setRect(ul2, R);
    [...ul2.querySelectorAll("li")].forEach((li, i) => setRect(li, { left: 100 + i * 58, top: 110, width: 50, height: 30 }));
    ul2.style.display = "flex";
    ul2.style.columnGap = "8px";
    await fireIn(ul2, "pointermove", { clientX: 154, clientY: 125 });
    assert.equal(r.all('[data-zone="gap"]').length, 1);
  });

  it("node tools live in the overlay layer outside the page document, so an overflow-clipped ancestor never clips them", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    await selectWithLayout(r, doc, "video");
    assert.ok(r.get("[data-canvas-overlays] [data-name-chip]"));
    assert.equal(doc.querySelectorAll("[data-name-chip]").length, 0);
  });
});

describe("handles: rotate cursor, readouts, device frame", () => {
  it("rotate zone: custom rotate cursor (an SVG turned to the element's angle); the 'N°' pill follows the pointer at +14px", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "classes.set", { group: "rotate", token: "rotate-[30deg]", at: e.get("img") });
    const { rendered } = await import("./canvasHarness.tsx");
    await rendered(r, 2);
    const img = await selectWithLayout(r, doc, "img");
    // rotated 30° about (200,150): the bottom-left corner sits near (88,143)
    await fireIn(img, "pointermove", { clientX: 90, clientY: 143 });
    const cursor = doc.body.style.getPropertyValue("--ph-rotate-cursor");
    assert.match(decodeURIComponent(cursor), /rotate\(30 12 12\)/);
    assert.match(cursor, /^url\("data:image\/svg\+xml,.*"\) 12 12, grab$/);
    const zone = r.get('[data-zone="rotate"]');
    await fireIn(zone, "pointerdown", { button: 0, buttons: 1, clientX: 90, clientY: 143 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 120, clientY: 230 })));
    const pill = r.get("[data-handle-readout]");
    assert.match(pill.textContent!, /^-?\d+°$/);
    assert.equal(pill.style.left, "134px");
    assert.equal(pill.style.top, "244px");
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 120, clientY: 230 })));
  });

  it("edge-resize hover comes only from the canvas document and is off while a rotation is in progress", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const img = await selectWithLayout(r, doc, "img");
    await fireIn(r.get("[data-canvas-host]"), "pointermove", { clientX: 298, clientY: 150 });
    assert.equal(r.all('[data-zone="edge"]').length, 0, "pointer over editor chrome: no zone");
    await fireIn(img, "pointermove", { clientX: 105, clientY: 195 });
    await fireIn(r.get('[data-zone="rotate"]'), "pointerdown", { button: 0, buttons: 1, clientX: 105, clientY: 195 });
    await fireIn(img, "pointermove", { clientX: 298, clientY: 150 });
    assert.equal(r.all('[data-zone="edge"]').length, 0);
    assert.equal(doc.body.hasAttribute("data-ph-edge"), false);
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 105, clientY: 195 })));
  });

  it("padding / resize readouts: padding label #15803d, resize label #1d4ed8, showing the current px", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const main = await selectWithLayout(r, doc, "main");
    await fireIn(main, "pointermove", { clientX: 150, clientY: 104 });
    await wait(PADDING_DWELL_MS + 20);
    await fireIn(r.get('[data-zone="padding"]'), "pointerdown", { button: 0, buttons: 1, clientX: 150, clientY: 104 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 150, clientY: 120 })));
    assert.match(r.get("[data-handle-readout]").className, /text-\[#15803d\]/);
    assert.equal(r.get("[data-handle-readout]").textContent, "16px");
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 150, clientY: 120 })));
    const main2 = doc.querySelector<HTMLElement>("main")!;
    setRect(main2, R);
    (main2.parentElement as unknown as { getBoundingClientRect(): unknown }).getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800 });
    await wait(10);
    await fireIn(doc.body, "pointermove", { clientX: 304, clientY: 150 });
    await wait(PADDING_DWELL_MS + 20);
    await fireIn(r.get('[data-zone="resize"]'), "pointerdown", { button: 0, buttons: 1, clientX: 304, clientY: 150 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 204, clientY: 150 })));
    assert.match(r.get("[data-handle-readout]").className, /text-\[#1d4ed8\]/);
    assert.equal(r.get("[data-handle-readout]").textContent, "100px");
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 204, clientY: 150 })));
  });

  it("device frame: the page scrolls without a visible scrollbar inside the frame", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(doc.documentElement.getAttribute("data-device"), "false");
    actRun(e, "canvas.toggleDevice");
    await wait(0);
    assert.equal(doc.documentElement.getAttribute("data-device"), "true");
    assert.match(doc.getElementById("pagehub-canvas-chrome")!.textContent!, /\[data-device="true"\] \{ scrollbar-width: none; \}/);
  });
});
