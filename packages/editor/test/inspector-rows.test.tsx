import "./setup.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { TYPE_HIDE, TYPE_SECTIONS } from "../../engine/src/elements/inspectorSpec.ts";
import { elementView } from "../src/features/inspector/useElementView.ts";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { inspectorLayout } from "../src/features/inspector/layout.ts";
import { rowEligible, sectionModel } from "../src/features/inspector/rowRules.ts";
import { header, inspector, inspectorUi, pageEditor, section, select, wait } from "./inspectorFixture.tsx";

afterEach(() => localStorage.clear());

const option = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.startsWith(label))!;
const apply = () => [...document.querySelectorAll<HTMLElement>("button")].find((b) => /^Add \(\d+\)$/.test(b.textContent ?? ""))!;

const view = (e: ReturnType<typeof pageEditor>, sel: string) => elementView(e.get(sel), e.state.facet(classGroupsFacet));
const row = (id: string) => inspectorRows().find((r) => r.id === id)!;

describe("element definitions carry the per-kind disable lists", () => {
  it("per-type disable lists match the inventory", () => {
    assert.deepEqual(TYPE_HIDE.text, ["bgColor", "background", "pattern", "border", "shadow", "radius", "opacity", "cursor", "accessibility", "alignment", "size"]);
    assert.deepEqual(TYPE_HIDE.image, ["textColor", "bgColor", "background", "pattern", "font", "opacity"]);
    assert.deepEqual(TYPE_HIDE.video, ["textColor", "bgColor", "background", "pattern", "font", "opacity", "hoverClick"]);
    for (const t of ["button", "link", "icon"]) assert.deepEqual(TYPE_HIDE[t], ["opacity"]);
    assert.deepEqual(TYPE_HIDE.form, ["font", "opacity", "cursor", "hoverClick", "animations"]);
    assert.deepEqual(TYPE_HIDE["form-control"], ["shadow", "radius", "opacity", "font", "pattern", "hoverClick", "animations"]);
    assert.deepEqual(TYPE_HIDE.background, ["shadow", "border", "opacity", "radius", "hoverClick", "animations"]);
    assert.deepEqual(TYPE_HIDE.map, ["textColor", "bgColor", "pattern", "font", "hoverClick"]);
    for (const t of ["embed", "audio"]) assert.deepEqual(TYPE_HIDE[t], ["textColor", "bgColor", "background", "pattern", "font", "border", "opacity", "hoverClick"]);
    for (const t of ["map-pin", "map-path"]) assert.deepEqual(TYPE_HIDE[t], ["textColor", "bgColor", "background", "pattern", "font", "shadow", "opacity", "border", "radius", "animations", "hoverClick"]);
  });

  it("each element resolves its type and hide list from its definition (per tag for video / audio)", () => {
    const e = pageEditor({ "index.liquid": `<h1>a</h1><img src="x" alt=""><video></video><audio></audio><iframe></iframe><button>b</button><a href="#">l</a><svg></svg><form></form><input><div></div>` });
    const types = ["h1", "img", "video", "audio", "iframe", "button", "a", "svg", "form", "input", "div"].map((t) => view(e, t).type);
    assert.deepEqual(types, ["text", "image", "video", "audio", "embed", "button", "link", "icon", "form", "form-control", "container"]);
    assert.deepEqual([...view(e, "audio").hidden], TYPE_HIDE.audio);
  });
});

describe("sections and rows for an element", () => {
  it("section list per tab, in today's order; Image Settings is search-only", () => {
    const ids = Object.fromEntries(inspectorLayout().map((t) => [t.id, t.sections.map((s) => s.title)]));
    assert.deepEqual(ids, {
      component: ["Component", "Data source"],
      interactions: ["Action", "Handlers", "Conditions", "State"],
      layout: ["Items", "Modifiers", "Layout", "Size"],
      design: ["Text", "Background", "Styles", "Hover", "Effects"],
      advanced: ["Attributes", "Classes", "AI Context", "Import / Export", "Permissions"],
    });
  });

  it("a section is hidden when its hide key is disabled or no row survives", () => {
    const e = pageEditor();
    const text = view(e, "h1");
    assert.equal(sectionModel("size", text).hidden, true, "Text disables size");
    assert.equal(sectionModel("alignment", text).hidden, true, "Text disables alignment");
    assert.equal(sectionModel("background", text).hidden, true, "Text disables background");
    const img = view(e, "img");
    assert.equal(sectionModel("typography", img).hidden, true, "Image disables font");
    assert.ok(!sectionModel("typography", text).hidden);
    assert.equal(sectionModel("hover", view(e, "video")).hidden, true, "Video disables hoverClick");
  });

  it("container-only rows; Data source only when set; inset only when positioned", () => {
    const e = pageEditor({ "index.liquid": `<div class="relative">x</div><p>t</p><span class="absolute">s</span>` });
    assert.equal(rowEligible(row("scrollEffect"), view(e, "div")), true);
    assert.equal(rowEligible(row("scrollEffect"), view(e, "p")), false);
    assert.equal(rowEligible(row("stateBindings"), view(e, "p")), false);
    assert.equal(sectionModel("data-source", view(e, "div")).hidden, true);
    assert.equal(rowEligible(row("inset"), view(e, "div")), true);
    const plain = pageEditor({ "index.liquid": "<div>x</div>" });
    assert.equal(rowEligible(row("inset"), view(plain, "div")), false);
  });

  it("Items shows only for an element with an items template, never at the root", () => {
    const e = pageEditor({ "index.liquid": "<section><ul><li>a</li></ul></section><ul><li>b</li></ul>" });
    assert.equal(sectionModel("preset-items", view(e, "section ul")).hidden, false);
    assert.equal(sectionModel("preset-items", view(e, "section")).hidden, true);
    const top = pageEditor({ "index.liquid": "<ul><li>b</li></ul>" });
    assert.equal(sectionModel("preset-items", view(top, "ul")).hidden, true, "a top-level list is the root");
  });

  it("component tab content: the type's own titled sections", () => {
    const titles = (t: string) => inspectorLayout({ componentTitles: TYPE_SECTIONS[t] })[0]!.sections.map((s) => s.title);
    assert.deepEqual(titles("video").slice(0, 3), ["Playback", "Accessibility", "Component"]);
    assert.deepEqual(titles("form").slice(0, 3), ["Form", "Conversion tracking", "Component"]);
    assert.deepEqual(titles("text")[0], "Edit HTML");
    assert.deepEqual(titles("container")[0], "Container Role");
    assert.deepEqual(TYPE_SECTIONS.map, ["Location", "Details", "Map Settings", "Center Position", "Accessibility"]);
  });

  it("row visibility: pinned + default-common rows always, others with a value or added this session", () => {
    const e = pageEditor();
    const v = view(e, "section");
    const m = sectionModel("alignment", v);
    assert.ok(m.visible.some((r) => r.id === "layoutPreset"), "pinned");
    assert.ok(m.visible.some((r) => r.id === "padding"), "has a value (p-4)");
    assert.ok(m.visible.some((r) => r.id === "alignItems"), "default common control, no value");
    assert.ok(!m.visible.some((r) => r.id === "placeContent"), "non-default, no value → behind '+'");
    assert.ok(sectionModel("alignment", v, ["placeContent"]).visible.some((r) => r.id === "placeContent"), "added this session");
  });

  it("row order: default/value rows by sortOrder, then session-added rows in click order (no stored toolbarOrder)", () => {
    const v = view(pageEditor(), "section");
    const order = sectionModel("size", v, ["boxSizing", "aspectRatio"]).visible.map((r) => r.id);
    assert.deepEqual(order, ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "boxSizing", "aspectRatio"]);
    const fresh = sectionModel("size", v).visible.map((r) => r.id);
    assert.deepEqual(fresh, ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight"], "default common controls show without adding");
  });

  it("'+' candidates: eligible, not pinned, not default, no value, not added", () => {
    const v = view(pageEditor(), "section");
    const c = sectionModel("alignment", v).candidates.map((r) => r.id);
    assert.ok(!c.includes("layoutPreset"), "pinned excluded");
    assert.ok(!c.includes("padding"), "value excluded");
    assert.ok(!c.includes("alignItems"), "default excluded");
    assert.ok(c.includes("placeContent"), "non-default extra stays behind '+'");
    assert.deepEqual(sectionModel("custom-css", v).candidates, [], "inline sections have no '+'");
  });
});

describe("Inspector rows rendered", () => {
  it("empty section: dimmed header, no body; a header click opens the '+' picker", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    // Attributes has only non-default, valueless rows for this section → still empty
    const h = header(r, "properties");
    assert.equal(h.tabIndex, -1);
    assert.ok(h.className.includes("opacity-40"));
    assert.equal(section(r, "properties")!.querySelector('[role="group"]'), null);
    await r.click(h);
    assert.ok(document.querySelector('input[placeholder]'), "the picker's search opened");
    r.unmount();
  });

  it("editor sections (Conditions): a header click opens the editor inline under it, never a drawer or popover", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    const h = header(r, "conditions");
    const open = () => !!section(r, "conditions")!.querySelector("[data-conditions-editor]");
    const was = open();
    await r.click(h);
    assert.equal(open(), !was, "the header toggles the inline editor like any section");
    if (!open()) await r.click(h);
    assert.ok(open());
    assert.equal(chromeOf(e.state).detail, null, "no drawer");
    assert.equal(document.querySelector('[data-row-popover-body="conditions"]'), null, "no popover");
    r.unmount();
  });

  it("single inline sections (Classes, Permissions …) always render their body and have no '+'", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "custom-css"));
    assert.ok(section(r, "custom-css")!.querySelector('[data-row="className"]'));
    assert.equal(section(r, "custom-css")!.querySelector('[data-add-property], [aria-label="Add property"]'), null);
    r.unmount();
  });

  it("picking a property with a default: section opened, value written, row kept in click order", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "effects"));
    await r.click(section(r, "effects")!.querySelector('[aria-label="Add property"]')!);
    await r.fire(option("Preview in editor"), "mousedown");
    await r.click(apply());
    assert.equal(e.get("section").attr("data-edit-preview"), "");
    assert.ok(section(r, "effects")!.querySelector('[data-row="previewInEditor"]'));
    assert.equal(JSON.parse(localStorage.getItem("pagehub-editor:accordion-state")!).Effects, true);
    r.unmount();
  });

  it("picking a property without a default adds it for the session only (empty row)", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    // Width shows by default now; Aspect ratio is a non-default extra behind '+'
    await r.click(header(r, "size"));
    await r.click(section(r, "size")!.querySelector('[aria-label="Add property"]')!);
    await r.fire(option("Aspect ratio"), "mousedown");
    await r.click(apply());
    assert.ok(section(r, "size")!.querySelector('[data-row="aspectRatio"]'));
    assert.equal(e.get("section").attr("class"), "p-4 bg-primary", "nothing written");
    assert.deepEqual(Object.values(inspectorUi(e).added), [["aspectRatio"]]);
    r.unmount();
    const reload = pageEditor({ "index.liquid": e.state.files.get("index.liquid")! });
    select(reload, "section");
    const r2 = inspector(reload);
    assert.equal(document.querySelector('[data-row="aspectRatio"]'), null, "gone after a reload");
    r2.unmount();
  });

  it("adding one popover row opens its popover on the next frame; adding several opens none", async () => {
    const e = pageEditor({ "index.liquid": "<section>x</section>" });
    select(e, "section");
    const r = inspector(e);
    // Transition / Transform / Animation show by default; Filter / Backdrop / Scroll effect are
    // non-default popover extras behind '+'.
    await r.click(header(r, "effects"));
    const pick = async (labels: string[]) => {
      await r.click(section(r, "effects")!.querySelector('[aria-label="Add property"]')!);
      for (const l of labels) await r.fire(option(l), "mousedown");
      await r.click(apply());
      await wait(40);
    };
    await pick(["Filter"]);
    assert.equal(inspectorUi(e).openRow?.endsWith(":filter"), true);
    act(() => void e.run("inspector.set", { openRow: null }));
    await pick(["Backdrop", "Scroll effect"]);
    assert.equal(inspectorUi(e).openRow, null);
    r.unmount();
  });

  it("clear (X) on a popover chip clears the value and keeps the row for the session", async () => {
    const e = pageEditor();
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "background"));
    const chip = () => section(r, "background")!.querySelector<HTMLElement>('[data-row="background"]');
    assert.ok(chip());
    await r.click(chip()!.querySelector('[aria-label="Clear Background"]')!);
    assert.equal(e.get("section").attr("class"), "p-4");
    assert.ok(chip(), "row kept");
    r.unmount();
  });
});

describe("'+' picker (AddPropertyMenu)", () => {
  it("one candidate → a direct button (tooltip = help); a popover candidate opens its popover instead of adding", async () => {
    const { AddPropertyMenu } = await import("../src/features/inspector/AddPropertyMenu.tsx");
    const { render } = await import("./harness.tsx");
    const added: string[] = [];
    const opened: string[] = [];
    const r = render(<AddPropertyMenu candidates={[row("width")]} onAdd={(rs) => added.push(...rs.map((x) => x.id))} onOpenPopover={(x) => opened.push(x.id)} />);
    const b = r.get('[aria-label="Add Width"]');
    assert.equal(b.getAttribute("data-tooltip-content"), row("width").help);
    await r.click(b);
    assert.deepEqual(added, ["width"]);
    r.rerender(<AddPropertyMenu candidates={[row("background")]} onAdd={(rs) => added.push(...rs.map((x) => x.id))} onOpenPopover={(x) => opened.push(x.id)} />);
    await r.click(r.get('[aria-label="Add Background"]'));
    assert.deepEqual(opened, ["background"]);
    assert.deepEqual(added, ["width"]);
    r.rerender(<AddPropertyMenu candidates={[]} onAdd={() => {}} onOpenPopover={() => {}} />);
    assert.equal(r.container.querySelector("button"), null, "nothing to add → no '+'");
    r.unmount();
  });

  it("several candidates → searchable multi-select with checkboxes and 'Add (N)' in click order", async () => {
    const { AddPropertyMenu } = await import("../src/features/inspector/AddPropertyMenu.tsx");
    const { render } = await import("./harness.tsx");
    const added: string[][] = [];
    const r = render(<AddPropertyMenu candidates={[row("width"), row("height"), row("maxWidth")]} onAdd={(rs) => added.push(rs.map((x) => x.id))} onOpenPopover={() => {}} />);
    await r.click(r.get('[aria-label="Add property"]'));
    assert.equal(r.all('[role="option"] span[aria-hidden]').length, 3, "a checkbox per option");
    await r.fire(option("Max width"), "mousedown");
    await r.fire(option("Width"), "mousedown");
    assert.equal(apply().textContent, "Add (2)");
    await r.click(apply());
    assert.deepEqual(added, [["maxWidth", "width"]]);
    await r.click(r.get('[aria-label="Add property"]'));
    await r.type(r.get("[data-ph-popover] input"), "zzz");
    assert.ok(r.get("[data-ph-popover]").textContent!.includes("zzz"));
    r.unmount();
    const { ALL_ADDED } = await import("../src/features/inspector/AddPropertyMenu.tsx");
    const { SearchableMenuPopover } = await import("../src/primitives/SearchableMenuPopover.tsx");
    const empty = render(<SearchableMenuPopover trigger="+" triggerAriaLabel="Add property" items={[]} multiSelect emptyMessage={ALL_ADDED} />);
    await empty.click(empty.get('[aria-label="Add property"]'));
    assert.ok(empty.get("[data-ph-popover]").textContent!.includes("All properties added"));
    empty.unmount();
  });
});
