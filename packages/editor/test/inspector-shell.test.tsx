import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { runKey } from "@pagehub/engine";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { InspectorTabs } from "../src/features/inspector/InspectorTabs.tsx";
import { DarkVariantToggle } from "../src/features/inspector/InspectorChrome.tsx";
import { searchPopupPosition, SEARCH_POPUP } from "../src/features/inspector/InspectorSearch.tsx";
import { inspectorConfig } from "../src/features/inspector/inspectorState.ts";
import { rowMatches } from "../src/features/inspector/rowRules.ts";
import { AccordionProvider } from "../src/features/toolbar/AccordionContext.tsx";
import { ToolbarSection } from "../src/features/toolbar/ToolbarSection.tsx";
import { render } from "./harness.tsx";
import { header, inspector, inspectorUi, pageEditor, PAGE, section, select, wait } from "./inspectorFixture.tsx";

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

const tabIds = () => [...document.querySelectorAll("[data-inspector-tab]")].map((t) => t.getAttribute("data-inspector-tab"));
const stored = () => JSON.parse(localStorage.getItem("pagehub-editor:accordion-state") ?? "{}");

describe("inspector: empty state and element swap", () => {
  it("nothing selected → empty state; an element → tabs, mounted once while the element swaps", async () => {
    const e = pageEditor();
    const r = inspector(e);
    assert.ok(r.container.querySelector('[data-inspector-empty="page"]'));
    select(e, "section");
    const tablist = r.get('[role="tablist"]');
    select(e, "h1");
    assert.equal(r.get('[role="tablist"]'), tablist, "same tab bar node");
    r.unmount();
  });

  it("page mode: Add Blocks / Add Components / Reusable components / AI card per host options; close link when closable", () => {
    const e = pageEditor(undefined, [inspectorConfig({ blocks: false, closable: true, aiCard: <div data-ai-card="" /> })]);
    const r = inspector(e);
    const rows = r.all("[data-action-row]").map((b) => b.getAttribute("data-action-row"));
    assert.deepEqual(rows, ["Add Components", "Reusable components"]);
    assert.ok(r.container.querySelector("[data-ai-card]"));
    assert.ok(r.all("button").some((b) => b.textContent === "close sidebar"));
    r.unmount();
    const plain = inspector(pageEditor());
    assert.deepEqual(plain.all("[data-action-row]").map((b) => b.getAttribute("data-action-row")), ["Add Blocks", "Add Components", "Reusable components"]);
    assert.ok(!plain.all("button").some((b) => b.textContent === "close sidebar"));
    plain.unmount();
  });

  it("component editor (canvas mode): 'New reusable component' with no partials, else 'Select something to edit'", () => {
    const none = pageEditor();
    act(() => void none.run("inspector.set", { componentEditor: "partials/card.liquid" }));
    const r = inspector(none);
    assert.deepEqual(r.all("[data-action-row]").map((b) => b.getAttribute("data-action-row")), ["New reusable component"]);
    r.unmount();
    const some = pageEditor({ "index.liquid": PAGE, "partials/card.liquid": "<div>c</div>" });
    act(() => void some.run("inspector.set", { componentEditor: "partials/card.liquid" }));
    const r2 = inspector(some);
    assert.deepEqual(r2.all("[data-action-row]").map((b) => b.getAttribute("data-action-row")), ["Select something to edit"]);
    r2.unmount();
  });

  it("an element inside a partial (outside the component editor): no tab bar, the linked-instance bar", async () => {
    const e = pageEditor({ "index.liquid": "{% render 'header' %}", "partials/header.liquid": "<header><p>Logo</p></header>" });
    act(() => e.select(e.get("header", "partials/header.liquid")));
    const r = inspector(e);
    assert.equal(r.container.querySelector('[role="tablist"]'), null);
    assert.equal(r.get("[data-linked-instance]").getAttribute("data-linked-instance"), "header");
    assert.deepEqual(r.all("[data-action-row]").map((b) => b.getAttribute("data-action-row")), ["Edit Linked Instance", "Style Only Mode", "Content Only Mode", "Unlink Component"]);
    await r.click(r.get('[data-action-row="Edit Linked Instance"]'));
    assert.equal(inspectorUi(e).componentEditor, "partials/header.liquid");
    assert.ok(r.get('[role="tablist"]'), "inside the component editor the tabs show");
    r.unmount();
  });
});

describe("inspector: tabs", () => {
  it("tab order Component (tooltip = the element's name), Interactions, Layout, Design, Advanced; 70vh spacer", () => {
    const e = pageEditor();
    select(e, "h1");
    const r = inspector(e);
    assert.deepEqual(tabIds(), ["component", "interactions", "layout", "design", "advanced"]);
    assert.equal(r.get('[data-inspector-tab="component"]').getAttribute("data-tooltip-content"), "Text");
    assert.ok(r.all("[data-inspector-scroll] > div").some((d) => d.style.minHeight === "70vh"));
    r.unmount();
  });

  it("host inspectorTabs limit the tabs for that type; a missing active tab falls back to the first", () => {
    const e = pageEditor(undefined, [inspectorConfig({ inspectorTabs: { text: ["design", "advanced"] } })]);
    select(e, "h1");
    const r = inspector(e);
    assert.deepEqual(tabIds(), ["design", "advanced"]);
    assert.equal(r.get('[data-inspector-tab="design"]').getAttribute("aria-selected"), "true", "ui.inspectorTab = component is missing here");
    select(e, "section");
    assert.deepEqual(tabIds(), ["component", "interactions", "layout", "design", "advanced"]);
    r.unmount();
  });

  it("tab click jumps to that panel by id (−7px), opens its sections only (persisted)", async () => {
    const e = pageEditor(undefined, [inspectorConfig({ inspectorTabs: { container: ["layout", "design"] } })]);
    select(e, "section");
    const r = inspector(e);
    const panel = r.get('[data-inspector-panel="design"]');
    Object.defineProperty(panel, "offsetTop", { value: 900, configurable: true });
    await r.click(r.get('[data-inspector-tab="design"]'));
    assert.equal(r.get("[data-inspector-scroll]").scrollTop, 893);
    assert.equal(stored().Styles, true);
    assert.equal(stored().Size, false);
    r.unmount();
  });

  it("indicator slides with a 0.2s cubic-bezier; the active colour applies after 160ms", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    // The active-tab indicator is a bg-base-content underline (dashboard parity), not bg-primary.
    const ind = r.get('[role="tablist"] [aria-hidden].bg-base-content') as HTMLElement;
    assert.match(ind.style.transition, /transform 0\.2s cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    await r.click(r.get('[data-inspector-tab="design"]'));
    // The newly-active tab is still the muted text-base-content/50 until the 160ms "lit" timer fires.
    assert.ok(r.get('[data-inspector-tab="design"]').className.includes("text-base-content/50"));
    await wait(200);
    assert.ok(!r.get('[data-inspector-tab="design"]').className.includes("text-base-content/50"));
    r.unmount();
  });

  it("first mount scrolls to the stored tab after 100ms; switching elements does not re-scroll", async () => {
    const e = pageEditor();
    act(() => void e.run("ui.set", { inspectorTab: "design" }));
    select(e, "section");
    const r = inspector(e);
    Object.defineProperty(r.get('[data-inspector-panel="design"]'), "offsetTop", { value: 600, configurable: true });
    await wait(150);
    const box = r.get("[data-inspector-scroll]");
    assert.equal(box.scrollTop, 593);
    box.scrollTop = 0;
    select(e, "h1");
    await wait(150);
    assert.equal(box.scrollTop, 0);
    r.unmount();
  });

  it("two inspectors keep their own scroll box and click lock", async () => {
    const seen: string[] = [];
    const tabs = ["a", "b"].map((id) => ({ id, title: id, icon: "box" as const, sectionTitles: [], content: <div /> }));
    const r = render(
      <>
        <AccordionProvider><InspectorTabs tabs={tabs} active="a" onActiveChange={(id) => seen.push(`1${id}`)} /></AccordionProvider>
        <AccordionProvider><InspectorTabs tabs={tabs} active="a" onActiveChange={(id) => seen.push(`2${id}`)} /></AccordionProvider>
      </>,
    );
    const [box1, box2] = r.all("[data-inspector-scroll]");
    r.all("[data-inspector-panel]").forEach((p, i) => Object.defineProperty(p, "offsetTop", { value: (i % 2) * 500, configurable: true }));
    await r.click(r.all('[data-inspector-tab="b"]')[0]!);
    box2!.scrollTop = 470;
    await act(() => void box2!.dispatchEvent(new Event("scroll")));
    assert.deepEqual(seen, ["1b", "2b"], "the second inspector isn't locked by the first one's click");
    assert.notEqual(box1, box2);
    r.unmount();
  });

  it("accordion state is keyed by title and shared across element types", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "custom-css"));
    assert.equal(stored().Classes, true);
    select(e, "h1");
    assert.equal(header(r, "custom-css").getAttribute("aria-expanded"), "true", "still open on another element type");
    r.unmount();
  });

  it("collapse-all shows 'Expand all' before any section is open (recomputed on registration)", () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    assert.equal(r.get("[data-collapse-all]").getAttribute("aria-label"), "Expand all");
    r.unmount();
  });

  it("the dark-variant toggle is off in the tab row (dashboard parity); the component itself still flips", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    assert.equal(r.all("[data-dark-toggle]").length, 0, "the moon toggle no longer sits in the inspector tab row");
    r.unmount();
    // DarkVariantToggle is still exported and functional for a host that chooses to mount it.
    let dark = false;
    const t = render(<DarkVariantToggle on={dark} onToggle={() => (dark = true)} />);
    assert.equal(t.get("[data-dark-toggle]").getAttribute("aria-pressed"), "false");
    await t.click(t.get("[data-dark-toggle]"));
    assert.equal(dark, true, "onToggle fired");
    t.rerender(<DarkVariantToggle on={dark} onToggle={() => {}} />);
    assert.equal(t.get("[data-dark-toggle]").getAttribute("aria-pressed"), "true");
    t.unmount();
  });
});

describe("section header", () => {
  it("only the title toggles (Enter / Space too); actions don't; help shows on the left after 750ms; generated id", async () => {
    const r = render(
      <AccordionProvider>
        <ToolbarSection title="Size" help="Width and height" actions={<button data-act="">a</button>}>
          <span>body</span>
        </ToolbarSection>
      </AccordionProvider>,
    );
    const h = r.get('[role="button"]');
    assert.equal(h.getAttribute("data-tooltip-delay-show"), "750");
    assert.equal(h.getAttribute("data-tooltip-place"), "left");
    await r.click(r.get("[data-act]"));
    assert.equal(h.getAttribute("aria-expanded"), "false");
    await act(async () => void h.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.equal(h.getAttribute("aria-expanded"), "true");
    assert.notEqual(h.id, "Size");
    assert.equal(r.get('[role="group"]').getAttribute("aria-labelledby"), h.id);
    r.unmount();
  });
});

describe("inspector: search", () => {
  it("⌘F over the sidebar opens a 280×40 popup at the pointer, kept 8px inside, input focused after 50ms", async () => {
    assert.deepEqual(searchPopupPosition(5, 5, { innerWidth: 1000, innerHeight: 800 }), { x: 8, y: 13 });
    assert.deepEqual(searchPopupPosition(990, 795, { innerWidth: 1000, innerHeight: 800 }), { x: 1000 - 280 - 8, y: 800 - 40 - 8 });
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    assert.equal(runKey(e, "mod+f", { ui: { pointerOver: "canvas" } }).handled, false);
    act(() => void runKey(e, "mod+f", { ui: { pointerOver: "panel" } }));
    const popup = r.get("[data-inspector-search]");
    assert.equal(popup.style.width, `${SEARCH_POPUP.width}px`);
    await wait(80);
    assert.equal(document.activeElement, popup.querySelector("input"));
    r.unmount();
  });

  it("Enter, Escape or an outside click closes the popup; the query stays applied", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    for (const close of ["enter", "escape", "outside"] as const) {
      await r.click(r.get("[data-inspector-search-button]"));
      const input = r.get("[data-inspector-search] input");
      await r.type(input, "pad");
      if (close === "outside") await r.fire(document.body, "pointerdown");
      else if (close === "enter") await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      else act(() => void runKey(e, "escape"));
      assert.equal(chromeOf(e.state).sidebarSearch, false, close);
      assert.equal(inspectorUi(e).query, "pad");
    }
    r.unmount();
  });

  it("an active query → 'Results for \"q\"' grouped by section, forced open (not persisted), matches highlighted", async () => {
    const painted: Record<string, number> = {};
    const g = globalThis as Record<string, unknown>;
    g.Highlight = class { size: number; constructor(...r: unknown[]) { this.size = r.length; } };
    const css = Object.getOwnPropertyDescriptor(g, "CSS");
    Object.defineProperty(g, "CSS", { configurable: true, value: { highlights: { set: (n: string, h: { size: number }) => (painted[n] = h.size), delete: (n: string) => delete painted[n] } } });
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    const before = localStorage.getItem("pagehub-editor:accordion-state");
    act(() => void e.run("inspector.set", { query: "width" }));
    const res = r.get("[data-inspector-results]");
    assert.ok(res.textContent!.includes('Results for "width"'));
    assert.equal(r.container.querySelector("[data-inspector-panel]"), null, "the tab stack is replaced");
    assert.ok(res.querySelector('[data-section-id="size"] [data-row="width"]'), "grouped by section, open");
    assert.ok((painted["inspector-search"] ?? 0) > 0);
    assert.equal(localStorage.getItem("pagehub-editor:accordion-state"), before, "forced open is not stored");
    assert.equal(r.container.querySelector("[data-pin]"), null, "no pin buttons while searching");
    act(() => void e.run("inspector.set", { query: "zzqq" }));
    assert.ok(r.get("[data-inspector-results]").textContent!.includes('No results for "zzqq"'));
    r.unmount();
    delete g.Highlight;
    if (css) Object.defineProperty(g, "CSS", css);
    else delete g.CSS;
  });

  it("search matches label, id, keywords and section title, over the rows the panel can show (fixed)", async () => {
    const width = inspectorRows().find((r) => r.id === "width")!;
    assert.ok(rowMatches(width, "Width") && rowMatches(width, "size") && rowMatches(width, "WID"));
    const bg = inspectorRows().find((r) => r.id === "background")!;
    assert.ok(rowMatches(bg, "bgColor"), "alias keyword");
    const e = pageEditor();
    select(e, "h1");
    const r = inspector(e);
    act(() => void e.run("inspector.set", { query: "pattern" }));
    assert.ok(r.get("[data-inspector-results]").textContent!.includes("No results"), "Text hides pattern / background");
    act(() => void e.run("inspector.set", { query: "repeat" }));
    assert.ok(r.get("[data-inspector-results]").textContent!.includes("No results"), "search-only Image Settings rows are not searched");
    r.unmount();
  });
});

describe("inspector: pins and the Pinned dock", () => {
  it("pin button pins / unpins (persisted); unpinnable sections have none; max 10", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    assert.equal(section(r, "component")?.querySelector("[data-pin]") ?? null, null);
    assert.equal(section(r, "permissions")!.querySelector("[data-pin]"), null);
    await r.click(r.get('[data-pin="size"]'));
    assert.deepEqual(JSON.parse(localStorage.getItem("pagehub-editor:inspector-pinned-sections")!), ["size"]);
    assert.equal(r.get('[data-pin="size"]').getAttribute("aria-pressed"), "true");
    await r.click(r.get('[data-pin="size"]'));
    assert.deepEqual(JSON.parse(localStorage.getItem("pagehub-editor:inspector-pinned-sections")!), []);
    for (const id of r.all("[data-pin]").map((b) => b.getAttribute("data-pin")!)) await r.click(r.get(`[data-pin="${id}"]`));
    assert.equal(JSON.parse(localStorage.getItem("pagehub-editor:inspector-pinned-sections")!).length, 10);
    r.unmount();
  });

  it("a pinned section's rows move to the dock; the stack shows the note", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    assert.equal(r.container.querySelector("[data-pin-dock]"), null, "no dock without pins");
    await r.click(r.get('[data-pin="alignment"]'));
    await r.click(header(r, "alignment"));
    assert.ok(section(r, "alignment")!.querySelector("[data-pinned-note]")!.textContent!.includes("Properties for this section are pinned below."));
    assert.ok(r.get('[data-pinned-section="alignment"] [data-row="padding"]'));
    await r.click(r.get('[aria-label="Unpin Layout"]'));
    assert.equal(r.container.querySelector("[data-pin-dock]"), null);
    r.unmount();
  });

  it("dock: default 250px; collapses (persisted); resizes 120px to 60% of the window (persisted)", async () => {
    localStorage.setItem("pagehub-editor:inspector-pinned-sections", JSON.stringify(["size"]));
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    const dock = () => r.get("[data-pin-dock]");
    assert.equal(dock().style.height, "250px");
    const handle = r.get("[data-pin-dock-resize]");
    await r.fire(handle, "pointerdown", { button: 0, clientY: 500 } as MouseEventInit);
    await act(async () => void window.dispatchEvent(new MouseEvent("pointermove", { clientY: -5000, buttons: 1 })));
    assert.ok(Math.abs(parseFloat(dock().style.height) - window.innerHeight * 0.6) < 0.01);
    await act(async () => void window.dispatchEvent(new MouseEvent("pointermove", { clientY: 5000, buttons: 1 })));
    assert.equal(dock().style.height, "120px");
    await act(async () => void window.dispatchEvent(new MouseEvent("pointerup", {})));
    assert.equal(localStorage.getItem("pagehub-editor:sidebar-inspector-pin-height"), "120");
    await r.click(r.get('[aria-label="Collapse pinned panel"]'));
    assert.equal(dock().getAttribute("data-pin-dock"), "collapsed");
    assert.equal(localStorage.getItem("pagehub-editor:sidebar-inspector-pin-dock"), "false");
    r.unmount();
  });
});
