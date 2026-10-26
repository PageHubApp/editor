import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { Inspector } from "../src/features/inspector/Inspector.tsx";
import { InspectorTabs } from "../src/features/inspector/InspectorTabs.tsx";
import { AccordionProvider } from "../src/features/toolbar/AccordionContext.tsx";
import { inspectorLayout } from "../src/features/inspector/layout.ts";
import { uiField } from "../src/state/uiState.ts";
import { fixtureEditor, render, withEditor } from "./harness.tsx";

afterEach(() => localStorage.clear());

describe("inspector layout (property map → tabs)", () => {
  it("tab order Component, Interactions, Layout, Design, Advanced; sections in today's order", () => {
    const tabs = inspectorLayout();
    assert.deepEqual(tabs.map((t) => t.title), ["Component", "Interactions", "Layout", "Design", "Advanced"]);
    assert.deepEqual(tabs.find((t) => t.id === "layout")!.sections.map((s) => s.title), ["Items", "Modifiers", "Layout", "Size"]);
    assert.deepEqual(tabs.find((t) => t.id === "interactions")!.sections.map((s) => s.title), ["Action", "Handlers", "Conditions", "State"]);
    assert.ok(!tabs.some((t) => t.sections.some((s) => s.id === "image-settings")), "Image Settings is search-only");
  });
});

describe("Inspector shell", () => {
  it("one continuous stack: every tab's panel and its sections render, with a spacer", () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <Inspector />));
    assert.deepEqual(r.all("[data-inspector-panel]").map((p) => p.getAttribute("data-inspector-panel")), ["component", "interactions", "layout", "design", "advanced"]);
    assert.ok(r.get('[data-inspector-panel="layout"] [data-section="Size"]'));
    assert.equal(r.get('[data-inspector-tab="component"]').getAttribute("aria-selected"), "true");
    r.unmount();
  });

  it("tab click → active tab in ui state, that tab's sections open, the others closed (persisted)", async () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <Inspector />));
    await r.click(r.get('[data-inspector-tab="layout"]'));
    assert.equal(e.state.field(uiField).inspectorTab, "layout");
    assert.equal(r.get('[data-inspector-tab="layout"]').getAttribute("aria-selected"), "true");
    const stored = JSON.parse(localStorage.getItem("pagehub-editor:accordion-state")!);
    assert.equal(stored.Size, true);
    assert.equal(stored.Background, false);
    assert.ok(r.all('[data-inspector-panel="layout"] [role="group"]').length > 0);
    r.unmount();
  });

  it("scroll follows the last panel within 60px of the top; ignored for 400ms after a tab click", async () => {
    const seen: string[] = [];
    const tabs = ["a", "b", "c"].map((id, i) => ({ id, title: id, icon: "box" as const, sectionTitles: [], content: <div style={{ height: 500 }} data-i={i} /> }));
    const r = render(
      <AccordionProvider>
        <InspectorTabs tabs={tabs} active="a" onActiveChange={(id) => seen.push(id)} />
      </AccordionProvider>,
    );
    const box = r.get("[data-inspector-scroll]");
    const panels = r.all("[data-inspector-panel]");
    panels.forEach((p, i) => Object.defineProperty(p, "offsetTop", { value: i * 500, configurable: true }));
    box.scrollTop = 470;
    await act(() => void box.dispatchEvent(new Event("scroll")));
    assert.deepEqual(seen, ["b"]);
    await r.click(r.get('[data-inspector-tab="c"]'));
    box.scrollTop = 0;
    await act(() => void box.dispatchEvent(new Event("scroll")));
    assert.deepEqual(seen, ["b", "c"], "scroll ignored right after a click");
    r.unmount();
  });

  it("collapse-all closes every open section, then opens them all", async () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <Inspector />));
    const btn = () => r.get("[data-collapse-all]");
    // no inspector section is titled "Content", so nothing starts open
    assert.equal(btn().getAttribute("aria-label"), "Expand all");
    await r.click(btn());
    assert.ok(r.all('[data-inspector-scroll] [role="group"]').length > 10);
    assert.equal(btn().getAttribute("aria-label"), "Collapse all");
    await r.click(btn());
    assert.equal(r.all('[data-inspector-scroll] [role="group"]').length, 0);
    r.unmount();
  });
});
