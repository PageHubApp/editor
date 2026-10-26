import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { editSrcOf } from "@pagehub/engine/canvas";
import { toRect } from "../src/features/canvas/frameDom.ts";
import { MEASURE_MAX, measureLines } from "../src/features/canvas/measure.ts";
import { canvasEditor, mountCanvas, setRect } from "./canvasHarness.tsx";

const R = (left: number, top: number, width: number, height: number) => toRect({ left, top, width, height });
const dist = (lines: ReturnType<typeof measureLines>) => lines.map((l) => `${l.direction[0]}${l.distance}`).sort();

describe("measurement lines (pure)", () => {
  it("distances to the parent's four edges, only when more than 1px and under 300px", () => {
    const lines = measureLines(R(50, 40, 100, 60), R(0, 0, 300, 200), []);
    assert.deepEqual(dist(lines), ["h150", "h50", "v100", "v40"]);
    const top = lines.find((l) => l.direction === "vertical" && l.distance === 40)!;
    assert.deepEqual([top.x1, top.y1, top.x2, top.y2, top.labelY], [100, 0, 100, 40, 20], "from the parent's top edge to the element, at its centre");
    assert.deepEqual(dist(measureLines(R(1, 1, 100, 60), R(0, 0, 300, 200), [])), ["h199", "v139"], "1px is flush: no line");
    assert.deepEqual(dist(measureLines(R(400, 400, 10, 10), R(0, 0, 1000, 1000), [])), [], `${MEASURE_MAX}px and more is too far`);
  });

  it("a sibling beside it (overlapping rows) gets a horizontal line, one above or below (overlapping columns) a vertical one", () => {
    const t = R(100, 100, 50, 50);
    assert.deepEqual(dist(measureLines(t, null, [R(200, 100, 50, 50)])), ["h50"]);
    assert.deepEqual(dist(measureLines(t, null, [R(20, 100, 50, 50)])), ["h30"]);
    assert.deepEqual(dist(measureLines(t, null, [R(100, 180, 50, 50)])), ["v30"]);
    assert.deepEqual(dist(measureLines(t, null, [R(100, 10, 50, 50)])), ["v40"]);
    assert.deepEqual(dist(measureLines(t, null, [R(500, 500, 50, 50)])), [], "diagonal: nothing");
    assert.deepEqual(dist(measureLines(t, null, [R(150, 100, 50, 50)])), [], "touching: distance 0 is not drawn");
  });
});

describe("hold Alt → measurement lines", () => {
  let off = () => {};
  afterEach(() => off());
  const lines = () => document.querySelectorAll("[data-measurement-lines] [data-measure]");
  const altKey = (type: "keydown" | "keyup", altKey: boolean) => act(async () => void window.dispatchEvent(new KeyboardEvent(type, { key: "Alt", altKey, bubbles: true })));

  it("shows the distances of the hovered element only while Alt is held; release or blur clears them", async () => {
    const e = canvasEditor({ "index.liquid": `<main><h1>Hello</h1><p>Two</p></main>\n` });
    const { r, doc } = await mountCanvas(e);
    off = r.unmount;
    setRect(doc.querySelector("main")!, { left: 0, top: 0, width: 400, height: 300 });
    setRect(doc.querySelector("h1")!, { left: 20, top: 20, width: 200, height: 40 });
    setRect(doc.querySelector("p")!, { left: 20, top: 100, width: 200, height: 40 });
    await act(async () => void e.run("canvas.hover", { src: editSrcOf(e.get("h1")) }));
    assert.equal(lines().length, 0, "no Alt, no lines");
    await altKey("keydown", true);
    const got = [...lines()].map((l) => `${l.getAttribute("data-measure")![0]}${l.getAttribute("data-distance")}`).sort();
    assert.deepEqual(got, ["h180", "h20", "v20", "v240", "v40"], "the parent's edges (20 left / top, 180 right, 240 bottom) and the paragraph 40 below");
    assert.match(document.querySelector("[data-measurement-lines]")!.textContent!, /40px/);
    await altKey("keyup", false);
    assert.equal(lines().length, 0, "released");
    await altKey("keydown", true);
    assert.ok(lines().length > 0);
    await act(async () => void window.dispatchEvent(new Event("blur")));
    assert.equal(lines().length, 0, "blurring the window clears them");
  });
});
