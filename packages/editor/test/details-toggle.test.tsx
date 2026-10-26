import "./setup.ts";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { canvasOf } from "../src/features/canvas/canvasState.ts";
import { elementView } from "../src/features/inspector/useElementView.ts";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { rowEligible } from "../src/features/inspector/rowRules.ts";
import { canvasEditor, fireIn, mountCanvas, rendered, setRect } from "./canvasHarness.tsx";
import { actRun } from "./harness.tsx";

const PAGE = `<main><details><summary>Q</summary><p>A</p></details><p class="other">x</p></main>\n`;
const files = { "index.liquid": PAGE };

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("details: open by default (saved source)", () => {
  it("the inspector offers the row on details only, and writes / removes `open` as one undo step", () => {
    const e = canvasEditor(files);
    const row = inspectorRows().find((r) => r.id === "details.open")!;
    const view = (sel: string) => elementView(e.get(sel), e.state.facet(classGroupsFacet));
    assert.equal(rowEligible(row, view("details")), true);
    assert.equal(rowEligible(row, view("main")), false);
    assert.equal(row.kind, "boolean");

    actRun(e, "attr.set", { name: row.attr!, value: "", at: e.get("details") });
    assert.match(e.text(), /<details open(="")?>/);
    actRun(e, "history.undo");
    assert.doesNotMatch(e.text(), /<details open/);
    actRun(e, "history.redo");
    assert.match(e.text(), /<details open/);
    actRun(e, "attr.set", { name: row.attr!, value: null, at: e.get("details") });
    assert.doesNotMatch(e.text(), /<details open/);
  });
});

describe("details: canvas-only preview", () => {
  it("Alt-click on the summary previews closed without selecting or touching the source; it survives a re-render", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    const before = e.text();
    assert.equal(doc.querySelector("details")!.hasAttribute("open"), true, "open by default, as before");
    setRect(doc.querySelector("summary")!, { left: 0, top: 0, width: 200, height: 20 });

    await fireIn(doc.querySelector("summary")!, "mousedown", { altKey: true, clientX: 100 });
    assert.equal(e.state.selection.handles.length, 0, "no selection");
    assert.equal(e.text(), before, "no source change");
    assert.equal(canvasOf(e.state).closedDetails.length, 1);
    assert.equal(doc.querySelector("details")!.hasAttribute("open"), false);

    // an unrelated edit re-renders the document: the preview state is re-applied
    actRun(e, "attr.set", { name: "data-x", value: "1", at: e.get("p.other") });
    const doc2 = await rendered(r, 2);
    assert.equal(doc2.querySelector("details")!.hasAttribute("open"), false, "still closed after the re-render");

    await fireIn(doc2.querySelector("summary")!, "mousedown", { altKey: true, clientX: 100 });
    assert.equal(doc2.querySelector("details")!.hasAttribute("open"), true);
    assert.equal(canvasOf(e.state).closedDetails.length, 0);
  });

  it("a plain click on the summary body selects it and leaves the details open", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    setRect(doc.querySelector("summary")!, { left: 0, top: 0, width: 200, height: 20 });
    await fireIn(doc.querySelector("summary")!, "mousedown", { clientX: 100 });
    assert.equal(e.state.selection.primary, e.get("summary"));
    assert.equal(doc.querySelector("details")!.hasAttribute("open"), true);
    assert.equal(canvasOf(e.state).closedDetails.length, 0);
  });

  it("a click on the disclosure marker previews closed without selecting", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    setRect(doc.querySelector("summary")!, { left: 0, top: 0, width: 200, height: 20 });
    await fireIn(doc.querySelector("summary")!, "mousedown", { clientX: 5 });
    assert.equal(e.state.selection.handles.length, 0);
    assert.equal(doc.querySelector("details")!.hasAttribute("open"), false);
  });

  it("the name tag's Show closed / Show open control does the same preview toggle", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    await fireIn(doc.querySelector("summary")!, "mousedown", { clientX: 100 });
    const btn = () => r.container.querySelector<HTMLElement>("[data-details-preview]")!;
    assert.equal(btn().getAttribute("aria-label"), "Show closed");
    await fireIn(btn(), "click");
    assert.equal(doc.querySelector("details")!.hasAttribute("open"), false);
    assert.equal(btn().getAttribute("aria-label"), "Show open");
    assert.equal(e.text(), PAGE, "source untouched");
  });
});
