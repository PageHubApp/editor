import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { Chip } from "../src/primitives/Chip.tsx";
import { render } from "./harness.tsx";

const live: ReturnType<typeof render>[] = [];
const g = globalThis as { ResizeObserver?: unknown };
const saved = g.ResizeObserver;
afterEach(() => {
  live.splice(0).forEach((r) => r.unmount());
  g.ResizeObserver = saved;
});

describe("Chip row label", () => {
  it("the label gutter is w-20 unless a width is given", () => {
    const r = render(<Chip label="Padding"><input /></Chip>);
    live.push(r);
    assert.ok(r.get("button.truncate").parentElement!.className.split(" ").includes("w-20"));
    r.unmount();
    const wide = render(<Chip label="Padding" labelWidth="w-28"><input /></Chip>);
    live.push(wide);
    const gutter = wide.get("button.truncate").parentElement!.className.split(" ");
    assert.ok(gutter.includes("w-28") && !gutter.includes("w-20"));
  });

  it("clicking the label forwards to the control's handler", async () => {
    let clicks = 0;
    const r = render(<Chip label="Padding" onClick={() => void clicks++}><input /></Chip>);
    live.push(r);
    await r.click(r.get("button.truncate"));
    assert.equal(clicks, 1);
    r.unmount();
    let labelClicks = 0;
    const own = render(<Chip label="Gap" onClick={() => void clicks++} onLabelClick={() => void labelClicks++}><input /></Chip>);
    live.push(own);
    await own.click(own.get("button.truncate"));
    assert.deepEqual([clicks, labelClicks], [1, 1], "an explicit label handler wins");
  });

  it("the tooltip appears only when the label is truncated", async () => {
    let observer: (() => void) | undefined;
    g.ResizeObserver = class {
      constructor(cb: () => void) {
        observer = cb;
      }
      observe() {}
      disconnect() {}
    };
    const r = render(<Chip label="Background image position"><input /></Chip>);
    live.push(r);
    const label = r.get("button.truncate");
    assert.equal(label.getAttribute("data-tooltip-content"), null, "fits: no tooltip");
    Object.defineProperty(label, "scrollWidth", { value: 160, configurable: true });
    Object.defineProperty(label, "clientWidth", { value: 80, configurable: true });
    await act(async () => void observer!());
    assert.equal(label.getAttribute("data-tooltip-content"), "Background image position");
    Object.defineProperty(label, "scrollWidth", { value: 80, configurable: true });
    await act(async () => void observer!());
    assert.equal(label.getAttribute("data-tooltip-content"), null, "widened again: gone");
  });
});
