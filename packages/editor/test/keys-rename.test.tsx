import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { canvasEditor, fireIn, mountCanvas } from "./canvasHarness.tsx";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});
const keydown = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));

describe("rename fields end on Enter and Escape", () => {
  it("breadcrumb: Escape leaves the rename (the typed name stays); Enter does too", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    await r.click(r.get("[data-crumb-current]"));
    await r.type(r.get("[data-crumb-rename]"), "Title");
    await keydown(r.get("[data-crumb-rename]"), "Escape");
    assert.equal(r.all("[data-crumb-rename]").length, 0);
    assert.equal(e.get("h1").attr("data-edit-name"), "Title");
    await r.click(r.get("[data-crumb-current]"));
    await keydown(r.get("[data-crumb-rename]"), "Enter");
    assert.equal(r.all("[data-crumb-rename]").length, 0);
  });

  it("canvas name chip: Escape ends editing without clearing the selection", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor());
    cleanup = r.unmount;
    await fireIn(doc.querySelector("video")!, "mousedown");
    const chip = r.get("[data-name-chip]");
    await keydown(chip, "Enter");
    assert.equal(chip.getAttribute("contenteditable"), "true");
    await keydown(chip, "Escape");
    assert.equal(r.get("[data-name-chip]").getAttribute("contenteditable"), "false");
    assert.ok(e.state.selection.primary, "the selection stays");
  });
});
