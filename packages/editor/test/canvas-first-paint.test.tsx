import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { Editor } from "../src/index.ts";
import { whenPainted } from "../src/features/canvas/CanvasFrame.tsx";
import { canvasEditor, frameEl, rendered } from "./canvasHarness.tsx";
import { render, type Rendered } from "./harness.tsx";

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
});

describe("canvas first paint", () => {
  it("shows the skeleton from mount (no blank frame before it) and keeps the same iframe through the swap", async () => {
    const r = render(<Editor editor={canvasEditor()} />);
    open.push(r);
    assert.ok(r.container.querySelector("[data-page-skeleton]"), "skeleton on the very first commit");
    const iframe = frameEl(r);
    await rendered(r);
    for (let i = 0; i < 100 && r.container.querySelector("[data-page-skeleton]"); i++) await act(async () => void (await new Promise((res) => setTimeout(res, 20))));
    assert.equal(r.container.querySelector("[data-page-skeleton]"), null, "skeleton leaves once painted");
    assert.equal(frameEl(r), iframe, "the iframe is never remounted");
  });

  it("onPainted fires once, only after the first page has painted, so a host ghost can stay up until then", async () => {
    let painted = 0;
    const e = canvasEditor();
    const r = render(<Editor editor={e} onPainted={() => void painted++} />);
    open.push(r);
    assert.equal(painted, 0, "not before the first render");
    await rendered(r);
    for (let i = 0; i < 100 && !painted; i++) await act(async () => void (await new Promise((res) => setTimeout(res, 20))));
    assert.ok(painted >= 1, "after the paint");
    const after = painted;
    await act(async () => void (await new Promise((res) => setTimeout(res, 100))));
    assert.equal(painted, after, "not repeated");
  });

  it("whenPainted waits for the document's fonts, not just the write", async () => {
    let release!: () => void;
    const fonts = { ready: new Promise<void>((res) => (release = res)) };
    const doc = { defaultView: { requestAnimationFrame: (cb: () => void) => void setTimeout(cb, 0) }, fonts } as unknown as Document;
    let done = false;
    const p = whenPainted(doc, 5000).then(() => (done = true));
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(done, false, "still waiting on fonts");
    release();
    await p;
    assert.equal(done, true);
  });
});
