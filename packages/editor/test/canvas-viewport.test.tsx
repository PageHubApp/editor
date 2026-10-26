import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { chromeOf } from "../src/shell/chromeState.ts";
import { canvasOf } from "../src/features/canvas/canvasState.ts";
import { COACHMARK_KEY } from "../src/features/canvas/ViewportParts.tsx";
import { HOVER_CLOSE_MS } from "../src/features/canvas/BreakpointSwitcher.tsx";
import { RENAME_DEBOUNCE_MS } from "../src/features/canvas/CanvasOverlays.tsx";
import { DEVICE_GUIDES, defaultView, deviceFrame, fitModeFor, fitZoom, scopeBand, viewWidth, canvasBoxStyle, edgeDragWidth } from "../src/features/canvas/viewportMath.ts";
import { canvasEditor, fireIn, mountCanvas, rendered, setRect, wait } from "./canvasHarness.tsx";
import { actRun } from "./harness.tsx";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  localStorage.clear();
});
const view = (e: ReturnType<typeof canvasEditor>) => (e.state as any).field((e.state.config.fields as any[]).find((f) => f.name === "ui")).view as string;

describe("viewport", () => {
  it("default view: desktop (fluid) on a window ≥768px wide, otherwise mobile", async () => {
    assert.equal(defaultView(1024), "desktop");
    assert.equal(defaultView(767), "mobile");
    (window as any).happyDOM.setViewport({ width: 600, height: 800 });
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(view(e), "mobile");
    (window as any).happyDOM.setViewport({ width: 1024, height: 768 });
  });

  it("switcher (opens on hover): Responsive and Device toggles, chips Mobile·390 / SM / MD / LG / XL / 2XL with px, Zoom row", async () => {
    const { r } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    const menu = r.get("[data-bp-menu]");
    assert.deepEqual(r.all("[data-view-chip]").map((c) => c.textContent), ["Mobile390", "SM640", "MD768", "LG1024", "XL1280", "2XL1536"]);
    assert.match(menu.textContent!, /Responsive/);
    assert.match(menu.textContent!, /Device/);
    assert.ok(menu.querySelector("[data-zoom-control]"));
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseout");
    assert.equal(r.get("[data-bp-trigger]").getAttribute("aria-expanded"), "true", "a grace period before closing");
    await wait(HOVER_CLOSE_MS + 150);
    assert.equal(r.get("[data-bp-trigger]").getAttribute("aria-expanded"), "false", "closes after the hover grace");
  });

  it("switcher trigger: icon on desktop; just the label on a breakpoint; the zoom % when zoom ≠ 100%", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    const trigger = () => r.get("[data-bp-trigger]");
    assert.ok(trigger().querySelector("svg"));
    actRun(e, "canvas.view", { view: "md" });
    assert.equal(trigger().textContent, "MD");
    actRun(e, "canvas.zoomSet", { zoom: 0.5 });
    assert.equal(trigger().textContent, "50%");
  });

  it("click the active chip → back to desktop; Device on from desktop → mobile", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    await r.click(r.get('[data-view-chip="lg"]'));
    assert.equal(view(e), "lg");
    await r.click(r.get('[data-view-chip="lg"]'));
    assert.equal(view(e), "desktop");
    actRun(e, "canvas.toggleDevice");
    assert.equal(view(e), "mobile");
    assert.equal(canvasOf(e.state).device, true);
  });

  it("breakpoint view: width = drag override or bp px; responsive → max-width:min(100%,px), off → exact width + overflow-x auto; neutral/50 backdrop", async () => {
    assert.deepEqual(canvasBoxStyle(768, true), { maxWidth: "min(100%, 768px)", width: "100%" });
    assert.deepEqual(canvasBoxStyle(768, false), { width: "768px", overflowX: "auto" });
    // under CSS zoom the box's screen width is width * zoom, so the iframe's CSS viewport stays `width`
    assert.deepEqual(canvasBoxStyle(1024, true, 0.8), { maxWidth: "min(100%, 819.2px)", width: "100%" });
    assert.equal(viewWidth("md"), 768);
    assert.equal(viewWidth("md", 900), 900);
    assert.equal(viewWidth("desktop"), null);
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.view", { view: "md" });
    assert.equal(r.get("[data-canvas-host]").style.maxWidth, "min(100%, 768px)");
    assert.match(r.get("#viewport").className, /bg-neutral\/50/);
    actRun(e, "canvas.set", { responsive: false });
    assert.equal(r.get("[data-canvas-host]").style.width, "768px");
  });

  it("canvas edge handles: 20px strips with a 4×40 pill; drag = 2× delta ÷ zoom, clamped 240–3840; double-click resets; tooltip; not persisted", async () => {
    assert.equal(edgeDragWidth(768, 50, 1, "right"), 868);
    assert.equal(edgeDragWidth(768, 50, 0.5, "right"), 968);
    assert.equal(edgeDragWidth(768, 50, 1, "left"), 668);
    assert.equal(edgeDragWidth(300, -500, 1, "right"), 240);
    assert.equal(edgeDragWidth(3800, 500, 1, "right"), 3840);
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.view", { view: "md" });
    const right = r.get('[data-edge-handle="right"]');
    assert.match(right.className, /\bw-5\b/);
    assert.match(right.innerHTML, /h-10 w-1/);
    assert.equal(right.getAttribute("data-tooltip-content"), "768px — drag to resize, double-click to reset");
    await fireIn(right, "pointerdown", { button: 0, buttons: 1, clientX: 0 });
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 50 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 50 })));
    assert.equal(canvasOf(e.state).widthOverride, 868);
    await fireIn(r.get('[data-edge-handle="right"]'), "dblclick");
    assert.equal(canvasOf(e.state).widthOverride, null);
  });

  it("device guides (toggle) → dotted, non-interactive lines at 375, 390, 430, 768, 1024, 1440", async () => {
    assert.deepEqual([...DEVICE_GUIDES], [375, 390, 430, 768, 1024, 1440]);
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.set", { guides: true });
    const g = r.get("[data-device-guides]");
    assert.match(g.className, /pointer-events-none/);
    assert.deepEqual(r.all("[data-guide]").map((x) => Number(x.getAttribute("data-guide"))), [375, 390, 430, 768, 1024, 1440]);
    assert.match(r.get("[data-guide]").className, /border-dotted/);
  });

  it("device frames: phone 390×844, sm phone ×1024, md tablet ×1024, lg tablet ×768, xl laptop ×800 with chin, 2xl monitor ×864 with stand", async () => {
    const f = (v: any) => { const d = deviceFrame(v); return [d.kind, d.innerWidth, d.innerHeight, d.decoration]; };
    assert.deepEqual(f("mobile"), ["phone", 390, 844, "notch"]);
    assert.deepEqual(f("sm"), ["phone", 640, 1024, "notch"]);
    assert.deepEqual(f("md"), ["tablet", 768, 1024, "camera-top"]);
    assert.deepEqual(f("lg"), ["tablet", 1024, 768, "camera-side"]);
    assert.deepEqual(f("xl"), ["laptop", 1280, 800, "laptop-chin"]);
    assert.deepEqual(f("2xl"), ["monitor", 1536, 864, "monitor-stand"]);
    assert.deepEqual([deviceFrame("mobile").bezelX, deviceFrame("md").bezelX, deviceFrame("xl").bezelY, deviceFrame("2xl").bezelY], [18, 30, 48, 56]);
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.toggleDevice");
    assert.equal(r.get("[data-device-frame]").getAttribute("data-device-frame"), "phone");
    assert.match(r.get("[data-device-frame]").className, /rounded-\[44px\]/);
    assert.equal(r.get("[data-canvas-frame]").style.width, "390px");
    assert.equal(r.get("[data-canvas-frame]").style.height, "844px");
  });

  it("device zoom: CSS zoom plus --device-zoom-inverse so chrome stays crisp", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    actRun(e, "canvas.zoomSet", { zoom: 0.5 });
    const box = r.get("[data-canvas-box]");
    assert.equal(box.style.getPropertyValue("--device-zoom-inverse"), "2");
    assert.match(box.getAttribute("style")!, /zoom: 0\.5/);
  });

  it("zoom control: presets 25…1000%; − / + (+ disabled only at 1000%, fixed); level dropdown; 'Fit to window' (the default); reset to 100%", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    const select = r.get('[aria-label="Zoom level"]') as HTMLSelectElement;
    assert.equal(select.value, "fit");
    assert.equal(chromeOf(e.state).fit, true);
    assert.deepEqual([...select.options].map((o) => o.textContent), ["Fit · 100%", "25%", "33%", "50%", "67%", "75%", "80%", "90%", "100%", "110%", "125%", "150%", "175%", "200%", "300%", "500%", "750%", "1000%"]);
    actRun(e, "canvas.zoomSet", { zoom: 2 });
    assert.equal((r.get('[aria-label="Zoom in"]') as HTMLButtonElement).disabled, false, "200% can still zoom in");
    await r.click(r.get('[aria-label="Zoom in"]'));
    assert.equal(chromeOf(e.state).zoom, 3);
    actRun(e, "canvas.zoomSet", { zoom: 10 });
    assert.equal((r.get('[aria-label="Zoom in"]') as HTMLButtonElement).disabled, true);
    await r.click(r.get('[data-zoom-control] button:last-child'));
    assert.equal(chromeOf(e.state).zoom, 1);
    actRun(e, "canvas.zoomFit");
    assert.equal(chromeOf(e.state).fit, true);
  });

  it("while fitting, the level dropdown reads the applied scale and − / + step from it", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    actRun(e, "canvas.zoomFitApply", { zoom: 0.45 });
    await wait(0);
    const select = r.get('[aria-label="Zoom level"]') as HTMLSelectElement;
    assert.equal(select.selectedOptions[0]!.textContent, "Fit · 45%");
    assert.equal(r.get('[aria-label="Reset zoom to 100%"]').textContent, "Reset", "the reset button never reads like the zoom value");
    await r.click(r.get('[aria-label="Zoom out"]'));
    assert.equal(chromeOf(e.state).zoom, 0.33, "out from 45% lands on 33%");
    actRun(e, "canvas.zoomFit");
    actRun(e, "canvas.zoomFitApply", { zoom: 0.45 });
    await r.click(r.get('[aria-label="Zoom in"]'));
    assert.equal(chromeOf(e.state).zoom, 0.5, "in from 45% lands on 50%");
  });

  it("fit targets: device → both axes, offset 220, max 1; breakpoint → bp width, offset 420, max 1; clamped ≥ 0.25", () => {
    assert.deepEqual(fitModeFor("mobile", true), { kind: "both", targetW: 408, targetH: 862, offsetW: 220, offsetH: 220, max: 1 });
    assert.deepEqual(fitModeFor("md", false), { kind: "width", target: 768, offset: 420, max: 1 });
    assert.equal(fitZoom(fitModeFor("md", false), 1188, 900), 1);
    assert.equal(fitZoom(fitModeFor("md", false), 804, 900), 0.5);
    assert.equal(fitZoom(fitModeFor("md", false), 160, 900), 0.25);
    assert.equal(fitZoom(fitModeFor("mobile", true), 628, 651), 0.5);
    // a phone-sized pane keeps a small gutter, not the wide pane's margin (a 390 window fits the 390 view, not the 0.25 floor)
    assert.equal(fitZoom(fitModeFor("mobile", false), 390, 844), 358 / 390);
    assert.ok(fitZoom(fitModeFor("md", false), 390, 844) > 0.45, "tablet view in a phone window");
    assert.ok(fitZoom(fitModeFor("mobile", true), 390, 900) > 0.75, "device frame in a phone window");
    assert.equal(fitZoom(fitModeFor("md", false), 804, 900), 0.5, "wide panes keep the margin");
    // fluid desktop fills the window: fit never shrinks it
    assert.equal(fitZoom(fitModeFor("desktop", false), 1023, 900), 1);
    assert.equal(fitZoom(fitModeFor("desktop", false), 607, 900), 1);
  });

  it("fit-to-window follows the editor's box; an explicit zoom turns fit off", async () => {
    const e = canvasEditor();
    actRun(e, "canvas.view", { view: "md" });
    const { r } = await mountCanvas(e);
    cleanup = r.unmount;
    setRect(r.get('[data-slot="Canvas"]'), { left: 0, top: 0, width: 804, height: 900 });
    actRun(e, "canvas.zoomSet", { zoom: 1 });
    actRun(e, "canvas.zoomFit");
    await wait(0);
    assert.equal(chromeOf(e.state).zoom, 0.5);
  });

  it("scope band (22px): Base slate 'Editing Base · applies to all sizes'; breakpoints sky / emerald / violet / pink / rose; multi-scope amber with Clear", async () => {
    assert.deepEqual([scopeBand("desktop", []).head, scopeBand("desktop", []).detail], ["Editing Base", "changes apply to all sizes"]);
    assert.equal(scopeBand("desktop", []).color, "#64748b");
    assert.deepEqual([scopeBand("md", []).head, scopeBand("md", []).detail], ["Editing MD", "768px and up · changes here override Base"]);
    assert.deepEqual(["sm", "md", "lg", "xl", "2xl"].map((v) => scopeBand(v as any, []).color), ["#0ea5e9", "#10b981", "#8b5cf6", "#ec4899", "#f43f5e"]);
    assert.equal(scopeBand("desktop", ["md", "lg"]).color, "#f59e0b");
    assert.equal(scopeBand("desktop", ["md"]).color, "#10b981");
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.match(r.get("[data-scope-band]").className, /h-\[22px\]/);
    actRun(e, "ui.set", { multiScope: ["md", "lg"] });
    assert.match(r.get("[data-scope-band]").textContent!, /Editing MD \+ LG/);
    await r.click(r.get("[data-scope-band] button"));
    assert.equal(r.get("[data-scope-band]").textContent, "Editing Basechanges apply to all sizes");
    for (const v of ["sm", "md", "lg", "xl", "2xl", "desktop"] as const) {
      const b = scopeBand(v, []);
      const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i]!, 0);
      const [hi, lo] = [lum(b.color), lum(b.text)].sort((x, y) => y - x) as [number, number];
      assert.ok((hi + 0.05) / (lo + 0.05) >= 3.5, `${v}: ${b.text} on ${b.color} reads clearly`);
    }
  });

  it("first switch to a non-base view → coachmark 'Your edits now write md: classes' with Got it / ✕; shown once per browser", async () => {
    const { r, e } = await mountCanvas();
    assert.equal(r.all("[data-scope-coachmark]").length, 0);
    actRun(e, "canvas.view", { view: "md" });
    assert.equal(r.get("[data-scope-coachmark]").textContent, "Your edits now write md: classesGot it");
    await r.click(r.get("[data-scope-coachmark] .btn"));
    assert.equal(r.all("[data-scope-coachmark]").length, 0);
    assert.equal(localStorage.getItem(`pagehub-editor:${COACHMARK_KEY}`), "true");
    r.unmount();
    const again = await mountCanvas(e);
    cleanup = again.r.unmount;
    assert.equal(again.r.all("[data-scope-coachmark]").length, 0);
  });

  it("preview mode → floating 'Edit' pill restores the selection; Esc exits preview", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    actRun(e, "preview.toggle");
    assert.equal(r.all("[data-scope-band]").length, 0);
    await r.click(r.get("[data-preview-edit]"));
    assert.equal(chromeOf(e.state).preview, false);
    assert.equal(e.state.selection.primary, e.get("h1"));
    actRun(e, "preview.toggle");
    act(() => void e.press("escape"));
    assert.equal(chromeOf(e.state).preview, false);
  });

  it("Shift+Mod+H toggles hidden components (.hidden shown with a dotted border)", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(doc.documentElement.getAttribute("data-show-hidden"), "false");
    act(() => void e.press("ctrl+shift+h", { platform: "other" }));
    await wait(0);
    assert.equal(doc.documentElement.getAttribute("data-show-hidden"), "true");
    assert.match(doc.getElementById("pagehub-canvas-chrome")!.textContent!, /\[data-show-hidden="true"\] \.hidden \{ display: flex !important; border: 1px dotted currentColor; \}/);
  });

  it("#viewport is overflow-x-hidden scrollbar; overflow-y-hidden on the plain canvas (the frame scrolls itself), overflow-y-auto in a device frame", async () => {
    const { r } = await mountCanvas();
    cleanup = r.unmount;
    for (const c of ["overflow-y-hidden", "overflow-x-hidden", "scrollbar"]) assert.match(r.get("#viewport").className, new RegExp(`\\b${c}\\b`));
  });
});

describe("canvas overlays: chips and badges", () => {
  it("every selected element has a name tag with ↑ select-parent and the ▾ ancestors menu; media sit top/end", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    assert.equal(r.get("[data-name-chip]").textContent, "Heading");
    assert.equal(r.all("[data-name-tag] [data-select-parent]").length, 1);
    assert.equal(r.all("[data-name-tag] [data-crumb-more]").length, 1);
    await r.click(r.get("[data-name-tag] [data-select-parent]"));
    assert.equal(e.state.selection.primary, e.get("h1").parent(), "↑ selects the parent");
    await fireIn(doc.querySelector("video")!, "mousedown");
    const chip = r.get("[data-name-chip]");
    assert.equal(chip.textContent, "Video");
    const tag = r.get("[data-name-tag]");
    for (const c of ["ph-node-name-chip", "bg-base-100", "px-2", "text-xs"]) assert.match(tag.className, new RegExp(c));
    assert.match(tag.getAttribute("style")!, /left: 0px; top: 2px; transform: translate\(-100%, 0\)/, "top/end; at the canvas top it moves inside");
  });

  it("a scroll of the canvas document moves the name tag in the same task (no frame behind)", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    const h1 = doc.querySelector("h1")!;
    h1.getBoundingClientRect = () => new DOMRect(0, 300, 100, 30);
    // not wrapped in act: only a synchronous render inside the event can update the tag here
    doc.defaultView!.dispatchEvent(new Event("scroll"));
    assert.match(r.get("[data-name-tag]").getAttribute("style")!, /top: 298px/);
    h1.getBoundingClientRect = () => new DOMRect(0, 450, 100, 30);
    doc.defaultView!.dispatchEvent(new Event("scroll"));
    assert.match(r.get("[data-name-tag]").getAttribute("style")!, /top: 448px/);
  });

  it("click the name chip → contentEditable; typing writes data-edit-name after 500ms; Enter / Space on the chip enters edit mode; blur exits", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("video")!, "mousedown");
    const chip = r.get("[data-name-chip]");
    await act(async () => void chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(chip.getAttribute("contenteditable"), "true");
    chip.textContent = "Intro clip";
    await act(async () => void chip.dispatchEvent(new Event("input", { bubbles: true })));
    assert.equal(e.get("video").attr("data-edit-name"), undefined, "debounced");
    await wait(RENAME_DEBOUNCE_MS + 30);
    assert.equal(e.get("video").attr("data-edit-name"), "Intro clip");
    await act(async () => void chip.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    assert.equal(r.get("[data-name-chip]").getAttribute("contenteditable"), "false");
  });

  it("condition badge: 'Conditional' (amber-500) inside {% if %}, 'Hidden' (red-500) with the hidden class; click toggles hidden", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("p.note")!, "mousedown");
    const badge = () => r.get("[data-condition-badge]");
    assert.equal(badge().textContent, "Conditional");
    assert.match(badge().className, /bg-amber-500/);
    await r.click(badge());
    assert.match(e.get("p").attr("class")!, /\bhidden\b/);
    assert.equal(badge().textContent, "Hidden");
    assert.match(badge().className, /bg-red-500/);
    await r.click(badge());
    assert.doesNotMatch(e.get("p").attr("class")!, /\bhidden\b/);
    await fireIn(doc.querySelector("h1")!, "mousedown");
    assert.equal(r.all("[data-condition-badge]").length, 0);
  });

  it("lint badge: a 12px dot at the element's top-left −6px (red = error, yellow = warning), always shown; hover lists the issues; Fix applies the rule's fix", async () => {
    const e = canvasEditor({ "index.liquid": '<main>\n  <img src="/b.png" class="w-10">\n  <p data-edit-src="x#1">Hi</p>\n</main>\n' });
    const { r, doc } = await mountCanvas(e);
    cleanup = r.unmount;
    setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(doc.querySelector("img")!, { left: 50, top: 70, width: 40, height: 40 });
    actRun(e, "canvas.set", { guides: false });
    const warn = r.get('[data-lint-dot="warning"]');
    assert.match(warn.className, /size-3/);
    assert.match(warn.className, /bg-yellow-400/);
    assert.equal(warn.parentElement!.style.left, "44px");
    assert.equal(warn.parentElement!.style.top, "64px");
    assert.match(r.get('[data-lint-dot="error"]').className, /bg-red-500/);
    await fireIn(warn.parentElement!, "mouseover");
    assert.match(r.get("[data-lint-card]").textContent!, /alt/i);
    await fireIn(warn.parentElement!, "mouseout");
    await fireIn(r.get('[data-lint-dot="error"]').parentElement!, "mouseover");
    await r.click(r.get("[data-lint-fix]"));
    assert.equal(e.text(), '<main>\n  <img src="/b.png" class="w-10">\n  <p>Hi</p>\n</main>\n');
    e.undo();
    assert.match(e.text(), /data-edit-src="x#1"/, "one undo step");
    await rendered(r, 3); // let the re-renders settle before unmount
  });
});

describe("overlays follow the frame's visible area", () => {
  it("a lint dot and a name tag for an element scrolled out of the frame are hidden, and come back when it scrolls in", async () => {
    const e = canvasEditor({ "index.liquid": '<main>\n  <img src="/b.png" class="w-10">\n  <video src="/v.mp4"></video>\n</main>\n' });
    const { r, doc } = await mountCanvas(e);
    cleanup = r.unmount;
    setRect(r.get("[data-canvas-frame]"), { left: 100, top: 50, width: 390, height: 600 });
    setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
    const scroll = () => act(async () => void doc.defaultView!.dispatchEvent(new Event("scroll")));
    setRect(doc.querySelector("img")!, { left: 20, top: 900, width: 40, height: 40 });
    setRect(doc.querySelector("video")!, { left: 20, top: 900, width: 100, height: 50 });
    await fireIn(doc.querySelector("video")!, "mousedown");
    await scroll();
    assert.equal(r.all("[data-lint-dot]").length, 0, "below the frame: no dot");
    assert.equal(r.get("[data-name-tag]").style.visibility, "hidden", "below the frame: the name tag hides, it is not pulled in");
    setRect(doc.querySelector("img")!, { left: 20, top: 300, width: 40, height: 40 });
    setRect(doc.querySelector("video")!, { left: 20, top: 300, width: 100, height: 50 });
    await scroll();
    assert.ok(r.all("[data-lint-dot]").length > 0, "inside the frame: the dot shows");
    assert.equal(r.get("[data-name-tag]").style.visibility, "", "inside the frame: the name tag shows");
  });
});

describe("breadcrumb", () => {
  it("nothing selected → an empty bar (the page selector names the page)", async () => {
    const { r } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(r.get('[data-slot="Breadcrumb"]').textContent, "");
  });

  it("selection heading: bold name, muted type, one ▾ (no parent pill, no dashed box)", async () => {
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    const name = r.get("[data-crumb-current]");
    assert.match(name.className, /font-semibold/);
    assert.doesNotMatch(name.className, /border-dashed/);
    assert.equal(r.get("[data-crumb-type]").textContent, "h1");
    assert.equal(r.all("[data-crumb-parent]").length, 0);
    assert.equal(r.get('[data-slot="Breadcrumb"]').className.includes("h-10"), true, "fixed height row");
  });

  it("▾ ancestry menu (≥2 crumbs, opens on hover or click): the page then every ancestor outermost first, the node last (current, not clickable); click selects that ancestor", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("li")!, "mousedown");
    await fireIn(r.get("[data-crumb-more]"), "mouseover");
    const rows = r.all("[data-path-row]");
    const labels = rows.map((x) => x.textContent);
    assert.equal(labels[0], "Page");
    assert.deepEqual(labels.slice(1, 4), ["Container", "List", "for"]);
    assert.deepEqual(rows.map((x) => x.getAttribute("data-path-row")), rows.map((_, i) => String(i)), "one level per row");
    const last = rows[rows.length - 1]!;
    assert.equal(last.getAttribute("aria-current"), "true");
    assert.equal(last.tagName, "DIV", "the current element is not a button");
    assert.equal(r.all("[data-path-connector]").length, rows.length - 1, "a connector joins every level to its parent");
    await r.click(rows[1]!);
    assert.equal(e.state.selection.primary, e.get("main"));
  });

  it("current name click → inline rename; keystrokes write data-edit-name; Enter exits", async () => {
    const { r, doc, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    const current = r.get("[data-crumb-current]");
    await r.click(current);
    const input = r.get("[data-crumb-rename]");
    await r.type(input, "Title");
    assert.equal(e.get("h1").attr("data-edit-name"), "Title");
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(r.get("[data-crumb-current]").textContent, "Title");
  });

  it("right-click on the name opens the canvas context menu for that element; child names drop the parent-name prefix", async () => {
    const e = canvasEditor({ "index.liquid": '<section data-edit-name="Hero"><h1 data-edit-name="Hero Title">Hi</h1></section>\n' });
    const { r, doc } = await mountCanvas(e);
    cleanup = r.unmount;
    await fireIn(doc.querySelector("h1")!, "mousedown");
    assert.equal(r.get("[data-crumb-current]").textContent, "Title");
    await fireIn(r.get("[data-crumb-current]"), "contextmenu", { clientX: 30, clientY: 40 });
    assert.equal(e.state.selection.primary, e.get("h1"));
    assert.deepEqual(chromeOf(e.state).contextMenu, { x: 30, y: 40 });
  });
});

describe("side-by-side mirror", () => {
  it("read-only second render at a chosen width, header 'XL mirror · read-only'; re-renders 60ms after edits; hidden in device mode", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    await r.click(r.get('[data-mirror-chip="xl"]'));
    assert.equal(canvasOf(e.state).mirror, "xl");
    assert.match(r.get("[data-mirror]").textContent!, /XL mirror · read-only/);
    await wait(120);
    const mirror = r.get("[data-mirror-frame]") as HTMLIFrameElement;
    assert.equal(mirror.contentDocument!.querySelectorAll("li.row").length, 3);
    await fireIn(mirror.contentDocument!.querySelector("h1")!, "mousedown");
    assert.equal(e.state.selection.primary, null, "read-only: clicks select nothing");
    actRun(e, "attr.set", { name: "alt", value: "Z", at: e.get("img") });
    await wait(20);
    assert.notEqual(mirror.contentDocument!.querySelector("img")!.getAttribute("alt"), "Z", "not yet");
    await wait(80);
    assert.equal((r.get("[data-mirror-frame]") as HTMLIFrameElement).contentDocument!.querySelector("img")!.getAttribute("alt"), "Z");
    actRun(e, "canvas.toggleDevice");
    assert.equal(r.all("[data-mirror]").length, 0);
  });

  it("scroll is mirrored both ways", async () => {
    const { syncScroll } = await import("../src/features/canvas/MirrorFrame.tsx");
    const calls: string[] = [];
    const fake = (name: string) => {
      const listeners: Array<() => void> = [];
      const win = { scrollX: 0, scrollY: 0, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener() {}, scrollTo: (x: number, y: number) => { calls.push(`${name}:${x},${y}`); win.scrollX = x; win.scrollY = y; listeners.forEach((f) => f()); } };
      return { defaultView: win, fire: () => listeners.forEach((f) => f()) } as any;
    };
    const a = fake("a");
    const b = fake("b");
    syncScroll(a, b);
    a.defaultView.scrollY = 300;
    a.fire();
    assert.deepEqual(calls, ["b:0,300"]);
    b.defaultView.scrollY = 120;
    b.fire();
    assert.deepEqual(calls, ["b:0,300", "a:0,120"]);
  });
});

describe("chip placement", () => {
  it("chips sit 2px outside the top edge; clipped at the top of the canvas they move inside; they counter-scale with the zoom", async () => {
    const { at } = await import("../src/features/canvas/CanvasOverlays.tsx");
    const rect = (top: number) => ({ left: 10, top, right: 110, bottom: top + 50, width: 100, height: 50 });
    assert.deepEqual(at(rect(100), "top-end"), { left: 110, top: 98, transform: "translate(-100%, -100%)" });
    assert.deepEqual(at(rect(100), "top-start"), { left: 10, top: 98, transform: "translateY(-100%)" });
    assert.deepEqual(at(rect(4), "top-end"), { left: 110, top: 6, transform: "translate(-100%, 0)" });
    const { r, doc } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(doc.querySelector("video")!, "mousedown");
    assert.match(r.get("[data-name-tag]").getAttribute("style")!, /zoom: var\(--device-zoom-inverse\)/);
    // scrolling the canvas re-checks the placement
    setRect(doc.querySelector("video")!, { left: 10, top: 100, width: 100, height: 50 });
    await act(async () => void doc.defaultView!.dispatchEvent(new Event("scroll")));
    assert.match(r.get("[data-name-tag]").getAttribute("style")!, /top: 98px; transform: translate\(-100%, -100%\)/);
  });
});
