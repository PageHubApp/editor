import "./setup.ts";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alignFromDrag, alignFromZones, detectBeside, findReorder, layerZone, type BesideMemo } from "../src/features/dnd/geometry.ts";
import { barFor, ghostAt } from "../src/features/dnd/dropPlan.ts";
import { toRect } from "../src/features/canvas/frameDom.ts";

const box = (left: number, top: number, width: number, height: number) => toRect({ left, top, width, height });
const col = [box(0, 0, 200, 40), box(0, 50, 200, 40), box(0, 100, 200, 40)];

describe("drop position", () => {
  it("in a gap → after the previous child; before the first / after the last → the edges", () => {
    assert.deepEqual(findReorder(col, "column", false, 10, 45), { index: 0, where: "after", reason: "gap" });
    assert.deepEqual(findReorder([box(0, 10, 200, 40), ...col.slice(1)], "column", false, 10, 5), { index: 0, where: "before", reason: "before_all" });
    assert.deepEqual(findReorder(col, "column", false, 10, 200), { index: 2, where: "after", reason: "after_all" });
  });

  it("nearest centre, split at 30% of its main-axis size (flipped for reversed flex)", () => {
    assert.deepEqual(findReorder(col, "column", false, 10, 61), { index: 1, where: "before", reason: "nearest" });
    assert.deepEqual(findReorder(col, "column", false, 10, 63), { index: 1, where: "after", reason: "nearest" });
    assert.equal(findReorder(col, "column", true, 10, 61)?.where, "after");
  });

  it("a single in-flow child splits at 42% (fix-table: the single-child constant is used)", () => {
    const one = [box(0, 0, 100, 100)];
    assert.equal(findReorder(one, "column", false, 10, 41)?.where, "before");
    assert.equal(findReorder(one, "column", false, 10, 43)?.where, "after");
  });

  it("zero-size children and the dragged node (null) are excluded; children are sorted along the main axis", () => {
    const row = [null, box(300, 0, 100, 40), box(0, 0, 0, 0), box(100, 0, 100, 40)];
    assert.deepEqual(findReorder(row, "row", false, 250, 10), { index: 3, where: "after", reason: "gap" });
    assert.equal(findReorder([null, box(0, 0, 0, 10)], "row", false, 1, 1), null);
  });

  it("the bar sits at the boundary (a gap's middle) across the parent's content box; in a row it is vertical at the child's height", () => {
    assert.deepEqual(barFor(col, 0, "after", "column", box(4, 0, 192, 140)), { orientation: "horizontal", x: 4, y: 45, length: 192 });
    assert.deepEqual(barFor([box(0, 0, 50, 30), box(60, 0, 50, 30)], 1, "after", "row", null), { orientation: "vertical", x: 110, y: 0, length: 30 });
  });

  it("the ghost is the source's size 4px past the bar, shifted to the alignment zone", () => {
    const bar = { orientation: "horizontal" as const, x: 0, y: 45, length: 400 };
    assert.deepEqual(ghostAt({ width: 100, height: 20 }, bar, box(0, 0, 400, 200), null), box(0, 49, 100, 20));
    assert.equal(ghostAt({ width: 100, height: 20 }, bar, box(0, 0, 400, 200), { axis: "horizontal", zone: "end" })?.left, 300);
    assert.equal(ghostAt({ width: 100, height: 20 }, bar, box(0, 0, 400, 200), { axis: "horizontal", zone: "center" })?.left, 150);
  });
});

describe("beside detection", () => {
  const target = box(0, 0, 400, 200);
  const opts = { column: true, skip: false, inFlow: 2 };
  const memo = (): BesideMemo => ({ key: "", side: null });

  it("edge band = clamp(w·0.22, 28, 96) inside the vertical body (gutter clamp(h·0.18, 18, 56))", () => {
    assert.equal(detectBeside(target, 80, 100, opts, memo()), "left");
    assert.equal(detectBeside(target, 90, 100, opts, memo()), null);
    assert.equal(detectBeside(target, 320, 100, opts, memo()), "right");
    assert.equal(detectBeside(target, 10, 30, opts, memo()), null, "inside the 36px top gutter");
    assert.equal(detectBeside(box(0, 0, 160, 100), 30, 50, opts, memo()), "left", "28px minimum band");
  });

  it("5px hysteresis on the same target and side", () => {
    const m = memo();
    assert.equal(detectBeside(target, 85, 100, opts, m), "left");
    assert.equal(detectBeside(target, 90, 100, opts, m), "left");
    assert.equal(detectBeside(target, 94, 100, opts, m), null);
  });

  it("only in column parents that aren't page / header / footer / section, with ≥2 in-flow children and a target ≥160px wide", () => {
    assert.equal(detectBeside(target, 10, 100, { ...opts, column: false }, memo()), null);
    assert.equal(detectBeside(target, 10, 100, { ...opts, skip: true }, memo()), null);
    assert.equal(detectBeside(target, 10, 100, { ...opts, inFlow: 1 }, memo()), null);
    assert.equal(detectBeside(box(0, 0, 159, 200), 10, 100, opts, memo()), null);
  });
});

describe("alignment intent", () => {
  const parent = box(0, 0, 600, 300);
  it("by drag direction: ≥20px, cross axis dominant ×1.5; middle third = centre, else start / end by sign", () => {
    assert.deepEqual(alignFromDrag(parent, "column", { x: 300, y: 100 }, 520, 110), { axis: "horizontal", zone: "end" });
    assert.deepEqual(alignFromDrag(parent, "column", { x: 500, y: 100 }, 300, 110), { axis: "horizontal", zone: "center" });
    assert.deepEqual(alignFromDrag(parent, "column", { x: 300, y: 100 }, 100, 100), { axis: "horizontal", zone: "start" });
    assert.equal(alignFromDrag(parent, "column", { x: 300, y: 100 }, 315, 100), null, "under 20px");
    assert.equal(alignFromDrag(parent, "column", { x: 300, y: 100 }, 340, 130), null, "not dominant");
    assert.deepEqual(alignFromDrag(parent, "row", { x: 300, y: 10 }, 300, 280), { axis: "vertical", zone: "end" });
    assert.equal(alignFromDrag(box(0, 0, 199, 199), "column", { x: 0, y: 0 }, 150, 0), null, "parent under 200px both ways");
  });

  it("by cursor zone (fallback): same parent 32px inner edges + middle third; another parent <30% / >70%", () => {
    assert.deepEqual(alignFromZones(parent, "column", true, 20, 10), { axis: "horizontal", zone: "start" });
    assert.deepEqual(alignFromZones(parent, "column", true, 590, 10), { axis: "horizontal", zone: "end" });
    assert.deepEqual(alignFromZones(parent, "column", true, 300, 10), { axis: "horizontal", zone: "center" });
    assert.equal(alignFromZones(parent, "column", true, 100, 10), null);
    assert.deepEqual(alignFromZones(parent, "column", false, 100, 10), { axis: "horizontal", zone: "start" });
    assert.deepEqual(alignFromZones(parent, "column", false, 500, 10), { axis: "horizontal", zone: "end" });
  });
});

describe("layers row zones", () => {
  const row = box(0, 0, 300, 20);
  it("container with children 20 / 60 / 20; empty container 25 / 75; leaf halves; near the left edge at depth > 0 → after the parent", () => {
    const c = { depth: 0, container: true, hasChildren: true };
    assert.equal(layerZone(row, 100, 3, c), "before");
    assert.equal(layerZone(row, 100, 10, c), "inside");
    assert.equal(layerZone(row, 100, 17, c), "after");
    assert.equal(layerZone(row, 100, 4, { ...c, hasChildren: false }), "before");
    assert.equal(layerZone(row, 100, 6, { ...c, hasChildren: false }), "inside");
    assert.equal(layerZone(row, 100, 9, { depth: 0, container: false, hasChildren: false }), "before");
    assert.equal(layerZone(row, 100, 11, { depth: 0, container: false, hasChildren: false }), "after");
    assert.equal(layerZone(row, 60, 10, { ...c, depth: 1 }), "after-parent");
    assert.equal(layerZone(row, 70, 10, { ...c, depth: 1 }), "inside");
  });
});
