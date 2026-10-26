import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { stripEditSrc } from "../../engine/src/canvas/sourceMap.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { canvasOf } from "../src/features/canvas/canvasState.ts";
import { CANVAS_STYLE_ID } from "../src/features/canvas/canvasCss.ts";
import { canvasEditor, fireIn, mountCanvas, rendered, setRect, wait } from "./canvasHarness.tsx";
import { actRun } from "./harness.tsx";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("canvas: rendering and source mapping", () => {
  it("the iframe shows the page rendered with the engine; stored source never carries data-edit-src", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(doc.querySelectorAll("li.row").length, 3);
    assert.ok(doc.querySelector("header a"), "partial rendered");
    assert.ok(doc.getElementById(CANVAS_STYLE_ID), "chrome CSS injected into the canvas document");
    assert.ok(!e.text().includes("data-edit-src"));
    assert.equal(stripEditSrc(doc.body.innerHTML).includes("data-edit-src"), false);
  });

  it("an edit re-renders the canvas", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "attr.set", { name: "alt", value: "B", at: e.get("img") });
    const doc2 = await rendered(r, 2);
    assert.equal(doc2.querySelector("img")?.getAttribute("alt"), "B");
    void doc;
  });
});

describe("canvas: selection", () => {
  it("mousedown selects the deepest rendered element, on mousedown not click", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    assert.equal(e.state.selection.primary, e.get("h1"));
  });

  it("Cmd/Shift/Ctrl+click → single selection only (no multi-select)", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    await fireIn(doc.querySelector("img")!, "mousedown", { metaKey: true, shiftKey: true, ctrlKey: true });
    assert.deepEqual(e.state.selection.handles, [e.get("img")]);
  });

  it("mousedown on empty canvas area clears the selection", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    await fireIn(doc.body, "mousedown");
    assert.equal(e.state.selection.handles.length, 0);
  });

  it("second click on the selected element (moved ≤10px) deselects it (fixed: today's deselect is commented out)", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const img = doc.querySelector("img")!; // not a text leaf: a second click on selected text starts editing (richtext.test.tsx)
    await fireIn(img, "mousedown", { clientX: 5, clientY: 5 });
    await fireIn(img, "mouseup", { clientX: 5, clientY: 5 });
    assert.equal(e.state.selection.primary, e.get("img"), "first click selects");
    await fireIn(img, "mousedown", { clientX: 5, clientY: 5 });
    await fireIn(img, "mouseup", { clientX: 40, clientY: 5 });
    assert.equal(e.state.selection.primary, e.get("img"), "a drag-like move keeps it");
    await fireIn(img, "mousedown", { clientX: 5, clientY: 5 });
    await fireIn(img, "mouseup", { clientX: 12, clientY: 9 });
    assert.equal(e.state.selection.primary, null);
  });

  it("Esc selects the parent, then clears at the root; Tab / Shift+Tab select next / previous sibling, wrapping", async () => {
    const e = canvasEditor();
    e.select(e.get("h1"));
    assert.equal(e.press("tab").handled, true);
    assert.equal(e.state.selection.primary, e.get("ul"));
    assert.equal(e.press("shift+tab").handled, true);
    assert.equal(e.state.selection.primary, e.get("h1"));
    assert.equal(e.press("shift+tab").handled, true, "wraps to the last sibling");
    assert.notEqual(e.state.selection.primary, e.get("h1"));
    e.select(e.get("h1"));
    const parent = e.get("h1").parent();
    assert.equal(e.press("escape").handled, true);
    assert.equal(e.state.selection.primary, parent, "Esc selects the parent");
    for (let i = 0; i < 6 && e.state.selection.primary; i++) e.press("escape");
    assert.equal(e.state.selection.primary, null, "Esc at the root deselects");
    assert.equal(e.press("escape").handled, false, "nothing selected: Esc reaches the browser");
  });

  it("selection ring: data-selected on the element (never on body); static elements made relative and restored", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.select", { src: doc.querySelector("h1")!.getAttribute("data-edit-src") });
    await wait(0);
    const h1 = doc.querySelector<HTMLElement>("h1")!;
    assert.equal(h1.getAttribute("data-selected"), "true");
    assert.equal(h1.style.position, "relative");
    assert.equal(h1.getAttribute("data-position-override"), "");
    actRun(e, "selection.clear");
    await wait(0);
    assert.equal(h1.hasAttribute("data-selected"), false);
    assert.equal(h1.style.position, "");
    assert.equal(doc.body.hasAttribute("data-selected"), false);
    const css = doc.getElementById("pagehub-canvas-chrome")!.textContent!;
    assert.match(css, /\[data-selected="true"\] \{\s*outline: none !important;\s*box-shadow: inset 0 0 0 1px var\(--ph-editor-accent\), var\(--pagehub-outline-halo\);/);
    assert.match(css, /--ph-editor-accent: rgb\(59 130 246\)/);
    assert.match(css, /inset 0 0 0 2px rgba\(255, 255, 255, 0\.45\), inset 0 0 0 2px rgba\(0, 0, 0, 0\.15\)/);
    assert.match(css, /img\[data-selected="true"\] \{\s*outline: 1px solid var\(--ph-editor-accent\) !important;\s*outline-offset: -1px;/);
  });

  it("direct parent of the selection gets data-parent-of-selected (halo only)", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    assert.equal(doc.querySelector("main")!.getAttribute("data-parent-of-selected"), "true");
    assert.match(doc.getElementById("pagehub-canvas-chrome")!.textContent!, /\[data-parent-of-selected="true"\] \{\s*outline: none !important;\s*box-shadow: var\(--pagehub-outline-halo\);/);
    void e;
  });

  it("selected / hovered → cursor-grab; links and iframes inside the selection get pointer-events:none; links never navigate", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const css = doc.getElementById("pagehub-canvas-chrome")!.textContent!;
    assert.match(css, /\[data-selected="true"\], \[data-hover="true"\] \{ cursor: grab; \}/);
    assert.match(css, /\[data-selected="true"\] iframe, \[data-selected="true"\] a \{ pointer-events: none; \}/);
    const ev = new (doc.defaultView as unknown as typeof globalThis).MouseEvent("click", { bubbles: true, cancelable: true });
    doc.querySelector("a")!.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true);
  });

  it("grid lines (Shift+Mod+G) → every non-selected element gets a dashed outline", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    act(() => void e.press("ctrl+shift+g", { platform: "other" }));
    await wait(0);
    assert.equal(chromeOf(e.state).gridlines, true);
    assert.equal(doc.documentElement.getAttribute("data-show-gridlines"), "true");
    assert.match(doc.getElementById("pagehub-canvas-chrome")!.textContent!, /\[data-show-gridlines="true"\] \[data-edit-src\]:not\(\[data-selected="true"\]\) \{\s*outline: 1px dashed currentColor !important;/);
  });

  it("switching breakpoint or device scrolls the selected element into view after 200ms", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    let scrolled = 0;
    (doc.querySelector("h1") as HTMLElement).scrollIntoView = () => void scrolled++;
    actRun(e, "canvas.view", { view: "md" });
    await wait(100);
    assert.equal(scrolled, 0);
    await wait(150);
    assert.equal(scrolled, 1);
    actRun(e, "canvas.toggleDevice");
    await wait(250);
    assert.equal(scrolled, 2);
  });
});

describe("canvas: repeated rows and includes", () => {
  it("a {% for %} row selects the template element, and shows 'repeated ×N'", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const rows = doc.querySelectorAll("li.row");
    await fireIn(rows[2]!, "mousedown");
    assert.equal(e.state.selection.primary, e.get("li"));
    assert.equal(doc.querySelectorAll("li[data-selected]").length, 3, "every row rings");
    assert.equal(r.get("[data-repeated]").textContent, "repeated ×3");
  });

  it("a click inside an include selects the {% render %} tag and offers 'Edit header'; after it, clicks select inside the partial", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("header a")!, "mousedown");
    assert.equal(e.state.selection.primary?.text(), "{% render 'header' %}");
    const btn = r.get("[data-edit-include]");
    assert.equal(btn.textContent, "Edit header");
    assert.ok(r.get("[data-include-ring]"));
    await r.click(btn);
    assert.deepEqual(canvasOf(e.state).includes, ["partials/header.liquid"]);
    await fireIn(doc.querySelector("header a")!, "mousedown");
    assert.equal(e.state.selection.primary, e.get("a", "partials/header.liquid"));
  });
});

describe("canvas: hover", () => {
  it("mouseover hovers immediately; leaving the canvas clears it", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mouseover");
    assert.equal(e.state.selection.hover, e.get("h1"));
    await fireIn(doc.querySelector("h1")!, "mouseout", { relatedTarget: null });
    assert.equal(e.state.selection.hover, null);
  });

  it("hover ring: data-hover only when hovered and not selected; inset 1px accent at 60%", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    const h1 = doc.querySelector("h1")!;
    await fireIn(h1, "mouseover");
    assert.equal(h1.getAttribute("data-hover"), "true");
    await fireIn(h1, "mousedown");
    assert.equal(h1.hasAttribute("data-hover"), false);
    assert.match(doc.getElementById("pagehub-canvas-chrome")!.textContent!, /\[data-hover="true"\] \{\s*outline: none !important;\s*box-shadow: inset 0 0 0 1px color-mix\(in oklab, var\(--ph-editor-accent\) 60%, transparent\);/);
  });

  it("preview mode: clicks and hovers do nothing; no rings", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "preview.toggle");
    await wait(0);
    await fireIn(doc.querySelector("h1")!, "mousedown");
    await fireIn(doc.querySelector("h1")!, "mouseover");
    assert.equal(e.state.selection.primary, null);
    assert.equal(e.state.selection.hover, null);
  });
});

describe("canvas: context menu entry", () => {
  it("right-click on an element selects it and opens the context menu at the pointer (zoom-scaled), not inside fields", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    setRect(r.get("[data-canvas-frame]"), { left: 100, top: 50, width: 800, height: 600 });
    actRun(e, "canvas.zoomSet", { zoom: 0.5 });
    await fireIn(doc.querySelector("h1")!, "contextmenu", { clientX: 40, clientY: 20 });
    assert.equal(e.state.selection.primary, e.get("h1"));
    assert.deepEqual(chromeOf(e.state).contextMenu, { x: 120, y: 60 });
  });
});
