import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { canvasKit, canvasOf } from "../src/features/canvas/canvasState.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { DEVICE_PRESETS, deviceFrame, fitModeFor, fitZoom, rotatedPreset } from "../src/features/canvas/viewportMath.ts";
import { thumbFor, SCROLLBAR_GAP } from "../src/features/canvas/DeviceHeader.tsx";
import { ZOOM_KEY } from "../src/features/canvas/useZoomPersistence.ts";
import { isPageBackground } from "../src/features/canvas/HoverStrip.tsx";
import { CANVAS_CSS } from "../src/features/canvas/canvasCss.ts";
import { readJSON, writeJSON } from "../src/primitives/storage.ts";
import { actRun } from "./harness.tsx";
import { canvasEditor, fireIn, mountCanvas, rendered, wait } from "./canvasHarness.tsx";

let cleanup: (() => void) | null = null;
afterEach(async () => {
  await wait(20);
  cleanup?.();
  cleanup = null;
  globalThis.localStorage?.clear();
});

describe("device header bar and scrollbar", () => {
  it("phones: 17 presets ending in Custom; editing W × H switches to Custom; ✕ exits; zoom control in the bar", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.toggleDevice");
    const bar = r.get("[data-device-header]");
    assert.ok(bar.querySelector("[data-zoom-control]"));
    assert.equal(DEVICE_PRESETS.length, 17);
    assert.equal(DEVICE_PRESETS.at(-1)!.name, "Custom");
    await r.click(r.get("[data-device-preset-trigger]"));
    assert.equal(r.all("[data-device-preset]").length, 17);
    assert.match(r.get('[data-device-preset="Pixel 7"]').textContent!, /412 × 915 • 2\.625x DPR/);
    await r.click(r.get('[data-device-preset="Pixel 7"]'));
    assert.equal(r.get("[data-canvas-frame]").style.width, "412px");
    await r.type(r.get("[data-device-width]"), "400");
    assert.deepEqual([canvasOf(e.state).phone.name, canvasOf(e.state).phone.width, canvasOf(e.state).phone.height], ["Custom", 400, 915]);
    assert.equal(r.get("[data-canvas-frame]").style.width, "400px");
    await r.click(r.get("[data-device-exit]"));
    assert.equal(canvasOf(e.state).device, false);
  });

  it("iPhone Duo presets: outer 466 × 678 and inner 669 × 951 at 3x, and the frame fits a narrow pane", () => {
    const by = (n: string) => DEVICE_PRESETS.find((d) => d.name === n)!;
    assert.deepEqual([by("iPhone Duo outer").width, by("iPhone Duo outer").height, by("iPhone Duo outer").dpr], [466, 678, 3]);
    assert.deepEqual([by("iPhone Duo inner").width, by("iPhone Duo inner").height, by("iPhone Duo inner").dpr], [669, 951, 3]);
    const inner = by("iPhone Duo inner");
    const z = fitZoom(fitModeFor("mobile", true, undefined, inner), 390, 800);
    assert.ok(z >= 0.25 && z < 0.6, `inner frame shrinks to fit a 390px pane, got ${z}`);
    assert.equal(fitZoom(fitModeFor("mobile", true, undefined, by("iPhone Duo outer")), 1400, 1200), 1, "fits at 100% in a roomy pane");
  });

  it("every preset fits its pane after fitZoom at 390, 768 and 1440 wide, and the header never widens the frame box", async () => {
    for (const w of [390, 768, 1440]) {
      for (const p of DEVICE_PRESETS) {
        const f = deviceFrame("mobile", undefined, p);
        const z = fitZoom(fitModeFor("mobile", true, undefined, p), w, 800);
        assert.ok((f.innerWidth + f.bezelX) * z <= w - (w < 640 ? 32 : 220) + 0.01 || z === 0.25, `${p.name} at ${w}px: zoom ${z} overflows`);
      }
    }
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.toggleDevice");
    const header = r.get("[data-device-header]");
    assert.equal(header.closest("[data-canvas-host]")?.contains(header), true);
    assert.equal(header.closest(".w-fit"), null, "the wide header is centred in the pane, not inside the frame-sized box (it overflowed and scrolled the pane sideways)");
  });

  it("rotate: swaps W and H and stays on the preset; rotating back restores; every landscape preset fits at 390, 768 and 1440", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.toggleDevice");
    await r.click(r.get("[data-device-preset-trigger]"));
    await r.click(r.get('[data-device-preset="iPhone Duo inner"]'));
    assert.equal(r.get("[data-canvas-frame]").style.width, "669px");
    await r.click(r.get("[data-device-rotate]"));
    const ph = canvasOf(e.state).phone;
    assert.deepEqual([ph.name, ph.width, ph.height, ph.landscape], ["iPhone Duo inner", 951, 669, true]);
    assert.equal(r.get("[data-canvas-frame]").style.width, "951px");
    assert.equal(r.get("[data-canvas-frame]").style.height, "669px");
    assert.equal(r.get("[data-device-rotate]").getAttribute("aria-label"), "Rotate to portrait");
    assert.match(r.get("[data-device-preset-trigger]").textContent!, /iPhone Duo inner/);
    await r.click(r.get("[data-device-rotate]"));
    assert.deepEqual([canvasOf(e.state).phone.width, canvasOf(e.state).phone.height, !!canvasOf(e.state).phone.landscape], [669, 951, false]);
    for (const w of [390, 768, 1440]) {
      for (const p of DEVICE_PRESETS) {
        const land = rotatedPreset(p);
        const f = deviceFrame("mobile", undefined, land);
        assert.equal(f.innerWidth, p.height);
        const z = fitZoom(fitModeFor("mobile", true, undefined, land), w, 800);
        assert.ok((f.innerWidth + f.bezelX) * z <= w - (w < 640 ? 32 : 220) + 0.01 || z === 0.25, `${p.name} landscape at ${w}px: zoom ${z} overflows`);
        assert.ok((f.innerHeight + f.bezelY) * z <= 800 - 220 + 0.01 || z === 0.25, `${p.name} landscape at ${w}px: too tall`);
      }
    }
  });

  it("other kinds: kind and dimensions, then exit", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.view", { view: "md" });
    actRun(e, "canvas.toggleDevice");
    assert.match(r.get("[data-device-header]").textContent!, /tablet768 × 1024/);
    assert.ok(r.get("[data-device-exit]"));
  });

  it("scrollbar: 10px right of the frame at 80% height; thumb ≥ 30px, hidden when nothing scrolls", () => {
    assert.equal(thumbFor(0, 500, 500, 400), null);
    assert.deepEqual(thumbFor(0, 10000, 500, 400), { size: 30, top: 0 });
    assert.deepEqual(thumbFor(500, 1000, 500, 400), { size: 200, top: 200 });
    assert.equal(SCROLLBAR_GAP, 10);
  });
});

describe("breakpoint markers", () => {
  it("toggle shows 'MD · 768' lines; drag stays between neighbours and writes theme.css on release; double-click resets a custom one", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "view.toggleMarkers");
    assert.deepEqual(r.all("[data-marker]").map((m) => m.textContent), ["SM · 640", "MD · 768", "LG · 1024", "XL · 1280", "2XL · 1536"]);
    const md = r.get('[data-marker="md"]');
    await fireIn(md, "pointerdown", { button: 0, buttons: 1, clientX: 0 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 40 })));
    assert.equal(r.get('[data-marker="md"]').textContent, "MD · 808", "live preview");
    assert.equal(e.state.files.get("theme.css"), undefined, "nothing written mid-drag");
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 40 })));
    assert.match(e.state.files.get("theme.css")!, /--ph-bp-md: 808px;/);
    await fireIn(r.get('[data-marker="lg"]'), "pointerdown", { button: 0, buttons: 1, clientX: 0 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: -900 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: -900 })));
    assert.match(e.state.files.get("theme.css")!, /--ph-bp-lg: 809px;/, "clamped to md + 1");
    await fireIn(r.get('[data-marker="md"]'), "dblclick");
    assert.doesNotMatch(e.state.files.get("theme.css")!, /--ph-bp-md/);
  });

  it("the site's widths drive the canvas: a breakpoint view uses theme.css's width", async () => {
    const e = canvasEditor();
    actRun(e, "theme.setBreakpoint", { breakpoint: "md", px: 800 });
    const { r } = await mountCanvas(e);
    cleanup = r.unmount;
    actRun(e, "canvas.view", { view: "md" });
    assert.match(r.get("[data-canvas-host]").getAttribute("style")!, /800px/);
    assert.match(r.get("[data-scope-band]").textContent!, /800px and up/);
  });
});

describe("zoom persistence", () => {
  it("per mode, with the fit flag; nothing stored → Fit to window (the default)", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.toggleDevice");
    await wait(0);
    assert.equal(chromeOf(e.state).fit, true);
    actRun(e, "canvas.zoomSet", { zoom: 0.5 });
    await wait(0);
    assert.deepEqual(readJSON(ZOOM_KEY.device, null), { zoom: 0.5, fit: false });
    actRun(e, "canvas.toggleDevice");
    actRun(e, "canvas.toggleDevice");
    await wait(0);
    assert.deepEqual([chromeOf(e.state).zoom, chromeOf(e.state).fit], [0.5, false], "restored for the device mode");
  });

  it("a stored breakpoint zoom is restored when a breakpoint view opens", async () => {
    writeJSON(ZOOM_KEY.breakpoint, { zoom: 0.75, fit: false });
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.view", { view: "lg" });
    await wait(0);
    assert.deepEqual([chromeOf(e.state).zoom, chromeOf(e.state).fit], [0.75, false]);
  });
});

describe("hovered element tool strip", () => {
  it("the page background's read-only name chip shows on hover (top/start; bottom/start when clipped); other elements show none", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(isPageBackground(e.get("main")), true);
    assert.equal(isPageBackground(e.get("h1")), false);
    actRun(e, "selection.clear");
    await fireIn(doc.querySelector("h1")!, "mouseover");
    assert.equal(r.all("[data-hover-chip]").length, 0);
    await fireIn(doc.querySelector("main")!, "mouseover");
    const chip = r.get("[data-hover-chip]");
    assert.equal(chip.textContent, "Container"); // friendly node name for <main>, not the raw tag
    assert.equal(chip.getAttribute("data-hover-chip"), "bottom-start", "the page's top edge has no room above");
    await fireIn(doc.querySelector("main")!, "mousedown");
    assert.equal(r.all("[data-hover-chip]").length, 0, "not for the selection");
  });
});

describe("client role on the canvas", () => {
  it("[data-editable] elements outline on hover; the role is stamped on the canvas root", async () => {
    assert.match(CANVAS_CSS, /\[data-ph-role="client"\] \[data-editable\]:hover:not\(\[data-selected="true"\]\) \{\s*outline: 1px dashed/);
    const e = createTestEditor({ files: { "index.liquid": '<main><h1 data-editable="text">Hi</h1></main>' }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit()], role: "client" });
    const { r, doc } = await mountCanvas(e);
    cleanup = r.unmount;
    assert.equal(doc.documentElement.getAttribute("data-ph-role"), "client");
  });
});

describe("keys inside the canvas frame", () => {
  it("reach the editor's scoped keymap (Escape selects the parent, then clears at the root); keys in a text field inside the frame stay there", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    assert.ok(e.state.selection.primary);
    const input = doc.createElement("input");
    doc.body.appendChild(input);
    const inField = new (doc.defaultView as unknown as typeof globalThis).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => void input.dispatchEvent(inField));
    assert.ok(e.state.selection.primary, "text field keys aren't forwarded");
    const ev = new (doc.defaultView as unknown as typeof globalThis).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => void doc.body.dispatchEvent(ev));
    assert.ok(e.state.selection.primary && e.state.selection.primary.tag !== "h1", "Esc selected the parent");
    assert.equal(ev.defaultPrevented, true);
    for (let i = 0; i < 6 && e.state.selection.primary; i++) act(() => void doc.body.dispatchEvent(new (doc.defaultView as unknown as typeof globalThis).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(e.state.selection.primary, null, "at the root Esc deselects");
    await rendered(r);
  });
});

describe("rich text smoothness", () => {
  it("a text.setInner commit while a leaf is being edited doesn't rewrite the frame; the skipped render runs when editing ends", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const version = () => Number(r.get("[data-canvas-frame]").getAttribute("data-render-version"));
    const v = version();
    doc.querySelector("h1")!.setAttribute("data-rt-editing", "");
    actRun(e, "text.setInner", { target: e.get("h1"), source: "Typed" });
    await wait(30);
    assert.equal(version(), v, "no rewrite while editing");
    assert.match(e.text(), /<h1 class="text-xl">Typed<\/h1>/);
    actRun(e, "attr.set", { name: "id", value: "t", at: e.get("p.note") });
    await rendered(r, v + 1);
    doc.querySelector("h1")?.removeAttribute("data-rt-editing");
  });

  it("after editing ends, the skipped render runs", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    const v = Number(r.get("[data-canvas-frame]").getAttribute("data-render-version"));
    doc.querySelector("h1")!.setAttribute("data-rt-editing", "");
    actRun(e, "text.setInner", { target: e.get("h1"), source: "Typed" });
    await wait(30);
    act(() => doc.querySelector("h1")!.removeAttribute("data-rt-editing"));
    const fresh = await rendered(r, v + 1);
    assert.equal(fresh.querySelector("h1")!.textContent, "Typed");
  });
});
