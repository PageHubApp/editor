import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { mediaFacet, memoryMediaStore } from "@pagehub/engine/host";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { MediaManager } from "../src/features/media/MediaManager.tsx";
import { chromeOf } from "../src/shell/chromeState.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { MANUAL_CLOSE_COOLDOWN_MS, resetSwipeHintForTests } from "../src/shell/Sidebar.tsx";
import { actRun, fixtureEditor, render as mount } from "./harness.tsx";

const mounted: Array<ReturnType<typeof mount>> = [];
const render: typeof mount = (ui) => {
  const r = mount(ui);
  mounted.push(r);
  return r;
};
const restore: Array<() => void> = [];
afterEach(async () => {
  await act(async () => void (await new Promise((r) => setTimeout(r, 30)))); // let canvas renders settle
  for (const r of mounted.splice(0)) r.unmount();
  for (const f of restore.splice(0)) f();
});

const rect = (left: number, width: number) => ({ x: left, y: 0, left, top: 0, width, height: 800, right: left + width, bottom: 800, toJSON() {} });
/** Fake layout: the editor root is `rootWidth` wide, the sidebar 360px at the left. */
function layout(rootWidth: number) {
  const orig = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains("pagehub-editor")) return rect(0, rootWidth) as DOMRect;
    if (this.id === "toolbar") return rect(0, 360) as DOMRect;
    return orig.call(this);
  };
  restore.push(() => void (HTMLElement.prototype.getBoundingClientRect = orig));
}
const aside = () => document.querySelector<HTMLElement>("aside#toolbar")!;
const pointer = (target: EventTarget, type: string, clientX: number, extra: PointerEventInit = {}) =>
  act(() => void target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100, pointerType: "touch", ...extra })));

describe("sidebar (3.6, 2.1)", () => {
  it("docked: 360px, width / opacity animate over 200ms; on the right it moves last", () => {
    layout(1280);
    const e = fixtureEditor();
    render(<Editor editor={e} />);
    assert.equal(aside().getAttribute("data-sidebar-layout"), "docked");
    assert.match(aside().className, /w-\[360px\] opacity-100/);
    assert.match(aside().className, /transition-\[width,opacity\] duration-200/);
    assert.doesNotMatch(aside().className, /order-last/);
    actRun(e, "sidebar.toggleSide");
    assert.match(aside().className, /order-last/);
  });

  it("overlay when the editor root is under 768px: min(360px, 100vw), absolute; 'swipe to close' hint once per session", () => {
    layout(600);
    resetSwipeHintForTests();
    render(<Editor editor={fixtureEditor()} />);
    assert.equal(aside().getAttribute("data-sidebar-layout"), "overlay");
    assert.match(aside().className, /w-\[min\(360px,100vw\)\]/);
    assert.match(aside().className, /absolute inset-y-0/);
    assert.match(document.querySelector("[data-swipe-hint]")!.textContent!, /swipe to close/);
    render(<Editor editor={fixtureEditor()} />);
    assert.equal(document.querySelectorAll("[data-swipe-hint]").length, 1, "only once per session");
  });

  it("open by default, closed in a window ≤ 767px; closed = w-0, opacity-0, no pointer events", () => {
    const desc = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", { value: 700, configurable: true });
    restore.push(() => (desc ? Object.defineProperty(window, "innerWidth", desc) : void delete (window as { innerWidth?: number }).innerWidth));
    const e = fixtureEditor();
    render(<Editor editor={e} />);
    assert.equal(chromeOf(e.state).sidebarOpen, false);
    assert.match(aside().className, /w-0 opacity-0 pointer-events-none/);
  });

  it("a new selection opens it, except within 80ms of a manual close", () => {
    const e = fixtureEditor();
    render(<Editor editor={e} />);
    let now = 1_000_000;
    const clock = mock.method(Date, "now", () => now);
    try {
      actRun(e, "sidebar.close");
      now += MANUAL_CLOSE_COOLDOWN_MS - 1;
      act(() => e.select(e.get("h1")));
      assert.equal(chromeOf(e.state).sidebarOpen, false, "within the cooldown");
      now += 2;
      act(() => e.select(e.get("p")));
      assert.equal(chromeOf(e.state).sidebarOpen, true);
    } finally {
      clock.mock.restore();
    }
  });

  it("swipe from the inner 32px edge: ≥ 50px closes; a short pull springs back; the body of the panel never starts it", async () => {
    layout(600);
    const e = fixtureEditor();
    render(<Editor editor={e} />);
    pointer(aside(), "pointerdown", 200); // 160px from the edge: ignored
    pointer(window, "pointermove", 100);
    pointer(window, "pointerup", 100);
    assert.equal(chromeOf(e.state).sidebarOpen, true);
    pointer(aside(), "pointerdown", 350);
    pointer(window, "pointermove", 330);
    assert.match(aside().style.transform, /translateX\(-20px\)/);
    pointer(window, "pointerup", 330);
    assert.equal(chromeOf(e.state).sidebarOpen, true, "springs back");
    assert.match(aside().style.transition, /transform 180ms/);
    pointer(aside(), "pointerdown", 350);
    pointer(window, "pointermove", 290);
    pointer(window, "pointerup", 290);
    assert.equal(chromeOf(e.state).sidebarOpen, false);
    assert.ok(chromeOf(e.state).sidebarClosedAt > 0, "a manual close");
    await act(async () => void (await new Promise((r) => setTimeout(r, 300)))); // the spring / reset timers
  });

  it("hidden for a read-only viewer, and when the host passes Sidebar: null", () => {
    const viewer = createTestEditor({ files: { "index.liquid": "<p>x</p>" }, extensions: [htmlKit(), tailwindKit(), editorKit()], role: "viewer" });
    const r = render(<Editor editor={viewer} />);
    assert.equal(r.all("aside#toolbar").length, 0);
    const r2 = render(<Editor editor={fixtureEditor()} components={{ Sidebar: null }} />);
    assert.equal(r2.all("aside#toolbar").length, 0);
  });

  it("nothing selected → the EmptyState slot; its calls to action open the Add drawer on a tab, or close the sidebar", () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    act(() => e.select([]));
    assert.ok(r.get('aside [data-slot="EmptyState"]'));
    assert.equal(r.all('aside [data-slot="Inspector"]').length, 0);
    actRun(e, "menu.more");
    actRun(e, "insert.open", { tab: "blocks" });
    assert.deepEqual([chromeOf(e.state).drawer, addPanelOf(e.state).open, addPanelOf(e.state).tab], [null, true, "blocks"], "opening Add closes More");
    actRun(e, "menu.more");
    assert.equal(addPanelOf(e.state).open, false, "opening More closes Add");
    actRun(e, "sidebar.close");
    assert.equal(chromeOf(e.state).sidebarOpen, false);
    actRun(e, "insert.toggle");
    assert.deepEqual([chromeOf(e.state).sidebarOpen, addPanelOf(e.state).open], [true, true], "Insert opens the sidebar on the Add panel");
  });
});

/** The core ships no media manager (the `MediaManager` slot defaults to null); a host injects the facet-wired one. */
const MEDIA_HOST = { MediaManager };

describe("chrome panels (shell mounts)", () => {
  const withMedia = () =>
    createTestEditor({
      files: { "index.liquid": "<p>x</p>" },
      extensions: [htmlKit(), tailwindKit(), editorKit(), mediaFacet.of(memoryMediaStore({ items: [{ id: "m1", name: "a.png", contentType: "image/png", size: 10, folder: null, url: "u://m1", createdAt: 1 }] }))],
    });

  it("panel.media toggles the Media Manager window in the shell; panel.media again closes it", () => {
    const e = withMedia();
    const r = render(<Editor editor={e} components={MEDIA_HOST} />);
    assert.equal(r.all("[aria-label='Media library']").length, 0, "closed by default");
    actRun(e, "panel.media");
    assert.equal(chromeOf(e.state).panel, "media");
    assert.ok(r.get("[aria-label='Media library']"), "the media grid mounts when the panel opens");
    actRun(e, "panel.media");
    assert.equal(chromeOf(e.state).panel, null);
    assert.equal(r.all("[aria-label='Media library']").length, 0, "closed again");
  });

  it("the window's close control runs the same toggle", async () => {
    const e = withMedia();
    const r = render(<Editor editor={e} components={MEDIA_HOST} />);
    actRun(e, "panel.media");
    const close = r.all("button").find((b) => /close/i.test(b.getAttribute("aria-label") ?? ""));
    assert.ok(close, "a close button is present");
    await r.click(close!);
    assert.equal(chromeOf(e.state).panel, null, "closing the window clears the chrome panel");
  });
});

/**
 * The right slide-out drawer: Theme / Media / Modifiers now render INSIDE one drawer docked to the
 * editor's right edge (a flex sibling of the canvas column, so it pushes the canvas, never floats
 * over it), one at a time, driven by `chromeOf(state).panel`.
 */
describe("right drawer (slide-out)", () => {
  const drawer = (r: ReturnType<typeof render>) => r.get("[data-ph-right-drawer]");
  const withMedia = () =>
    createTestEditor({
      files: { "index.liquid": "<p>x</p>" },
      extensions: [htmlKit(), tailwindKit(), editorKit(), mediaFacet.of(memoryMediaStore({ items: [{ id: "m1", name: "a.png", contentType: "image/png", size: 10, folder: null, url: "u://m1", createdAt: 1 }] }))],
    });

  it("is mounted but closed by default (width 0, no body)", () => {
    const r = render(<Editor editor={fixtureEditor()} />);
    const d = drawer(r);
    assert.equal(d.getAttribute("data-open"), "false");
    assert.equal(d.style.width, "0px");
    assert.match(d.className, /transition-\[width\] duration-300 ease-out/, "slides like the AI-chat panel");
    assert.equal(r.all('[data-slot="ThemePanel"]').length, 0);
  });

  it("panel.theme opens Theme in the drawer — not a floating panel", () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    actRun(e, "panel.theme");
    const d = drawer(r);
    assert.equal(d.getAttribute("data-open"), "true", "the drawer is open");
    assert.ok(d.querySelector('[data-slot="ThemePanel"]'), "Theme renders inside the drawer");
    assert.equal(r.all("[data-ph-floating-panel]").length, 0, "Theme no longer floats");
    assert.match(d.querySelector("span")!.textContent ?? "", /Theme/, "the drawer titles it");
  });

  it("panel.modifiers opens Modifiers in the drawer — not a floating panel", () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    actRun(e, "panel.modifiers");
    const d = drawer(r);
    assert.equal(d.getAttribute("data-open"), "true");
    assert.ok(d.querySelector('[data-slot="ModifiersPanel"]'), "Modifiers renders inside the drawer");
    assert.equal(r.all("[data-ph-floating-panel]").length, 0, "Modifiers no longer floats");
  });

  it("switching panels swaps the body in the same drawer", () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    actRun(e, "panel.theme");
    assert.ok(drawer(r).querySelector('[data-slot="ThemePanel"]'));
    actRun(e, "panel.modifiers"); // theme → modifiers (one panel at a time)
    assert.equal(chromeOf(e.state).panel, "modifiers");
    assert.equal(r.all('[data-slot="ThemePanel"]').length, 0, "Theme body is gone");
    assert.ok(drawer(r).querySelector('[data-slot="ModifiersPanel"]'), "Modifiers body is now shown");
    assert.equal(r.all("[data-ph-right-drawer]").length, 1, "still one drawer");
  });

  it("Media opens chromeless in the drawer (its floating frame is dropped)", () => {
    const e = withMedia();
    const r = render(<Editor editor={e} components={MEDIA_HOST} />);
    actRun(e, "panel.media");
    const d = drawer(r);
    assert.equal(d.getAttribute("data-open"), "true");
    assert.ok(d.querySelector("[aria-label='Media library']"), "the media grid is in the drawer");
    assert.equal(r.all("[data-ph-floating-panel]").length, 0, "Media no longer floats");
  });

  it("the host declares its right sidebars via rightDockOffset; the row reserves that space", () => {
    const r = render(<Editor editor={fixtureEditor()} rightDockOffset={320} />);
    const row = r.get("[data-ph-right-drawer]").parentElement as HTMLElement;
    assert.equal(row.style.paddingRight, "320px", "the main row insets the host's sidebar width");
  });
});
