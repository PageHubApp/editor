import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { SWITCHER_CLOSE_MS } from "../src/features/canvas/BreakpointSwitcher.tsx";
import { SCROLL_AFTER_SWITCH_MS } from "../src/features/canvas/useScrollOnSwitch.ts";
import { DENSITY_KEY, IndicatorDensityRow, useIndicatorDensityPersistence } from "../src/features/toolbar/breakpoint-chip/IndicatorDensityRow.tsx";
import { chromeOf } from "../src/shell/chromeState.ts";
import { fixtureEditor, render } from "./harness.tsx";
import { fireIn, mountCanvas, withMockTimers } from "./canvasHarness.tsx";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { uiField } from "../src/state/uiState.ts";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  localStorage.clear();
});
const trigger = (r: ReturnType<typeof render>) => r.get("[data-bp-trigger]");
const open = (r: ReturnType<typeof render>) => trigger(r).getAttribute("aria-expanded") === "true";

describe("breakpoint switcher", () => {
  it("opens on hover and closes 180ms after the pointer leaves the trigger or the menu; re-entering the menu keeps it open", async () => {
    assert.equal(SWITCHER_CLOSE_MS, 180);
    const { r } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    assert.equal(open(r), true);
    const menu = r.get("[data-bp-menu]");
    // The grace period is a timer: drive it with a mock clock, so machine load cannot stretch a 100ms wait past 180ms.
    await withMockTimers(async (tick) => {
      await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseout");
      await tick(SWITCHER_CLOSE_MS - 1);
      assert.equal(open(r), true, "still inside the grace period");
      await fireIn(menu, "mouseover");
      await tick(SWITCHER_CLOSE_MS + 60);
      assert.equal(open(r), true, "moving onto the menu cancels the close");
      await fireIn(menu, "mouseout");
      await tick(SWITCHER_CLOSE_MS - 1);
      assert.equal(open(r), true);
      await tick(1);
      assert.equal(open(r), false, "closed after leaving the menu");
    });
  });

  it("Escape and an outside click also close it", async () => {
    const { r } = await mountCanvas();
    cleanup = r.unmount;
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    assert.equal(open(r), true);
    act(() => void document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(open(r), false, "Escape");
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    assert.equal(open(r), true);
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    assert.equal(open(r), false, "outside click");
  });

  it("any switch scrolls the selected element into view after 200ms", async () => {
    assert.equal(SCROLL_AFTER_SWITCH_MS, 200);
    const { r, e, doc } = await mountCanvas();
    cleanup = r.unmount;
    const h1 = doc.querySelector("h1")!;
    let scrolled = 0; // the switch's own scroll centres the element (the frame's render scroll is "nearest")
    const spy = (el: Element) => void ((el as HTMLElement).scrollIntoView = (o?: boolean | ScrollIntoViewOptions) => void ((o as ScrollIntoViewOptions | undefined)?.block === "center" && scrolled++));
    spy(h1);
    act(() => e.select(e.get("h1")));
    const h1Now = () => r.container.querySelector<HTMLIFrameElement>("[data-canvas-frame]")!.contentDocument!.querySelector("h1")!;
    // The delay is a timer: drive it with a mock clock (enabled after mount), so load cannot stretch a wait.
    await withMockTimers(async (tick) => {
      await tick(SCROLL_AFTER_SWITCH_MS + 60);
      const base = scrolled;
      await act(async () => void e.run("canvas.view", { view: "md" }));
      spy(h1Now());
      await tick(SCROLL_AFTER_SWITCH_MS - 1);
      assert.equal(scrolled, base, "not before the width settles");
      await tick(1);
      assert.equal(scrolled, base + 1);
      await act(async () => void e.run("canvas.toggleDevice"));
      spy(h1Now());
      await tick(SCROLL_AFTER_SWITCH_MS);
      assert.equal(scrolled, base + 2, "a device switch counts too");
    });
  });

  it("the zoom row writes the shared zoom (presets 0.25–10, Fit to window by default)", async () => {
    const { r, e } = await mountCanvas();
    cleanup = r.unmount;
    assert.equal(chromeOf(e.state).fit, true, "Fit to window is the default");
    await fireIn(r.get('[data-slot="BreakpointSwitcher"]'), "mouseover");
    const select = r.get("[data-zoom-control] select") as HTMLSelectElement;
    assert.deepEqual([...select.options].map((o) => o.value), ["fit", "0.25", "0.33", "0.5", "0.67", "0.75", "0.8", "0.9", "1", "1.1", "1.25", "1.5", "1.75", "2", "3", "5", "7.5", "10"]);
    await act(async () => {
      select.value = "0.5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.deepEqual([chromeOf(e.state).zoom, chromeOf(e.state).fit], [0.5, false]);
  });
});

function Harness() {
  useIndicatorDensityPersistence();
  return <IndicatorDensityRow />;
}

describe("indicator density preference", () => {
  const mount = () => {
    const e = fixtureEditor();
    const r = render(
      <EditorStoreProvider store={e}>
        <Harness />
      </EditorStoreProvider>,
    );
    return { e, r };
  };
  const pressed = (r: ReturnType<typeof render>) => r.all("[aria-pressed=true]").map((b) => b.textContent);

  it("Auto / Always / Off set the session density and are remembered in indicator-density", async () => {
    const { e, r } = mount();
    assert.deepEqual(pressed(r), ["Auto"]);
    await r.click(r.all("button").find((b) => b.textContent === "Always")!);
    assert.equal(e.state.field(uiField).density, "always");
    assert.deepEqual(pressed(r), ["Always"]);
    assert.equal(JSON.parse(localStorage.getItem(`pagehub-editor:${DENSITY_KEY}`)!), "always");
    r.unmount();
    const again = mount();
    assert.equal(again.e.state.field(uiField).density, "always", "restored on the next session");
    await again.r.click(again.r.all("button").find((b) => b.textContent === "Off")!);
    assert.equal(again.e.state.field(uiField).density, "off");
    again.r.unmount();
  });
});
