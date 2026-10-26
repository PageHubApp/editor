import "./setup.ts";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { useKeepInView, nudgeIntoBounds } from "../src/features/canvas/useKeepInView.ts";
import { render } from "./harness.tsx";
import { setRect } from "./canvasHarness.tsx";

const FRAME = { left: 0, top: 0, right: 390, bottom: 700 };
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });

describe("nudgeIntoBounds: chrome stays inside the canvas", () => {
  it("leaves a chip that fits alone", () => {
    assert.deepEqual(nudgeIntoBounds(box(100, 100, 120, 20), FRAME), { dx: 0, dy: 0 });
  });
  it("far right: pulls a chip back so its right edge keeps the gap", () => {
    assert.deepEqual(nudgeIntoBounds(box(350, 100, 120, 20), FRAME), { dx: -84, dy: 0 });
  });
  it("far left: pushes it in", () => {
    assert.deepEqual(nudgeIntoBounds(box(-30, 100, 120, 20), FRAME), { dx: 34, dy: 0 });
  });
  it("very top and bottom", () => {
    assert.deepEqual(nudgeIntoBounds(box(100, -12, 120, 20), FRAME), { dx: 0, dy: 16 });
    assert.deepEqual(nudgeIntoBounds(box(100, 690, 120, 20), FRAME), { dx: 0, dy: -14 });
  });
  it("a chip wider than the canvas keeps its left edge visible", () => {
    assert.deepEqual(nudgeIntoBounds(box(50, 100, 500, 20), FRAME), { dx: -46, dy: 0 });
  });
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function Chip({ n }: { n: number }) {
  const ref = useKeepInView<HTMLSpanElement>();
  return (
    <div data-slot="CanvasOverlays">
      <span ref={ref} data-chip={n} style={{ position: "absolute", left: 350 }}>
        chip
      </span>
    </div>
  );
}

describe("useKeepInView", () => {
  it("shifts a chip that overflows the right edge of a 390px frame, and clears the shift when it fits again", async () => {
    const r = render(<Chip n={0} />);
    cleanup = r.unmount;
    const layer = r.container.querySelector("[data-slot]")!;
    const chip = r.container.querySelector<HTMLElement>("[data-chip]")!;
    setRect(layer, { left: 0, top: 0, width: 390, height: 700 });
    setRect(chip, { left: 350, top: 100, width: 120, height: 20 });
    r.rerender(<Chip n={1} />);
    assert.equal(chip.style.translate, "-84px 0px");

    setRect(chip, { left: 100, top: 100, width: 120, height: 20 });
    r.rerender(<Chip n={2} />);
    assert.equal(chip.style.translate, "");

    setRect(chip, { left: 100, top: -8, width: 120, height: 20 });
    r.rerender(<Chip n={3} />);
    assert.equal(chip.style.translate, "0px 12px");
  });
});
