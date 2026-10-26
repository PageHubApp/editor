import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "react";
import { BreakpointChip } from "../src/features/toolbar/breakpoint-chip/BreakpointChip.tsx";
import { SectionOverrideDot } from "../src/features/toolbar/breakpoint-chip/SectionOverrideDot.tsx";
import { ToolbarItem } from "../src/features/toolbar/ToolbarItem.tsx";
import { classBinding } from "../src/features/inspector/propertyBinding.ts";
import { uiField, type UiState } from "../src/state/uiState.ts";
import { attachKeymap } from "../src/features/keyboard/domKeymap.ts";
import { PROPERTY_MAP } from "../src/property-map/propertyMap.ts";
import { actRun, countWrites, fixtureEditor, render, withEditor } from "./harness.tsx";

const P_TOKENS = ["p-2", "p-4", "p-6", "p-8", "p-12"];
const sectionClass = (e: ReturnType<typeof fixtureEditor>) => e.get("section").attr("class");
const setUi = (e: ReturnType<typeof fixtureEditor>, ui: Partial<UiState>) => assert.ok(actRun(e, "ui.set", ui));

/**
 * TODO: parity screenshots. Register these three looks as visual-regression states
 * (states: ToolbarItem select / text / radio rows; BreakpointChip hidden / hollow / amber /
 * primary / badge; SectionOverrideDot on) and compare against the SDK originals with
 * scripts/parity/compare.mjs. Behaviour is covered below.
 */
describe("ToolbarItem (connector → classes.set)", () => {
  function textRow(e: ReturnType<typeof fixtureEditor>) {
    const r = render(withEditor(e, <ToolbarItem prop="padding" label="Padding" type="text" />));
    return { r, input: r.get("input#input-p") as HTMLInputElement };
  }

  it("desktop view: shows the first value in base, md, sm… order and writes the base layer — one class write", async () => {
    const e = fixtureEditor();
    const writes = countWrites(e);
    const { r, input } = textRow(e);
    assert.equal(input.value, "p-4");
    await r.type(input, "p-6");
    assert.equal(writes.n, 1);
    assert.equal(sectionClass(e), "flex p-6 md:p-8 lg:p-10 gap-2");
    assert.equal(e.diff().split("\n").filter((l) => /^[-+]</.test(l)).length, 2, "one line changed");
    r.unmount();
  });

  it("md view: reads md: and writes md: (changeProp prefix)", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "md" });
    const { r, input } = textRow(e);
    assert.equal(input.value, "p-8");
    await r.type(input, "p-12");
    assert.equal(sectionClass(e), "flex p-4 md:p-12 lg:p-10 gap-2");
    r.unmount();
  });

  it("sm view: shows base when there is no sm: value, writes sm:", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "sm" });
    const a = textRow(e);
    assert.equal(a.input.value, "p-4");
    await a.r.type(a.input, "p-2");
    assert.equal(sectionClass(e), "flex p-4 md:p-8 lg:p-10 gap-2 sm:p-2");
    a.r.unmount();
  });

  it("dark on: shows the non-dark value when no dark: one, writes md:dark:", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "md", dark: true });
    const { r, input } = textRow(e);
    assert.equal(input.value, "p-8");
    await r.type(input, "p-2");
    assert.equal(sectionClass(e), "flex p-4 md:p-8 lg:p-10 gap-2 md:dark:p-2");
    r.unmount();
  });

  it("multi-scope: every chosen breakpoint in one write (one undo step)", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "md", multiScope: ["md", "xl"] });
    const writes = countWrites(e);
    const { r, input } = textRow(e);
    await r.type(input, "p-6");
    assert.equal(writes.n, 1);
    assert.equal(sectionClass(e), "flex p-4 md:p-6 lg:p-10 gap-2 xl:p-6");
    e.undo();
    assert.equal(sectionClass(e), "flex p-4 md:p-8 lg:p-10 gap-2");
    r.unmount();
  });

  it("hover state: writes hover: with no breakpoint, dark:hover: when dark is on", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "lg" });
    const r = render(withEditor(e, <ToolbarItem prop="hover.background" label="Background" type="text" />));
    await r.type(r.get("input#input-bg-color"), "bg-primary");
    assert.equal(sectionClass(e), "flex p-4 md:p-8 lg:p-10 gap-2 hover:bg-primary");
    setUi(e, { dark: true });
    await r.type(r.get("input#input-bg-color"), "bg-secondary");
    assert.equal(sectionClass(e), "flex p-4 md:p-8 lg:p-10 gap-2 hover:bg-primary dark:hover:bg-secondary");
    r.unmount();
  });

  it("radio: segmented control with a leading clear option; clear removes only this view's token", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "lg" });
    const options = [{ value: "", label: "—" }, ...["p-2", "p-4", "p-6", "p-10"].map((v) => ({ value: v, label: v }))];
    const r = render(withEditor(e, <ToolbarItem prop="padding" label="Padding" type="radio" options={options} />));
    const tabs = r.all('[role="tab"]');
    assert.equal(tabs[0]!.className.includes("flex-none px-2"), true);
    assert.equal(r.get('[role="tab"][aria-selected="true"]').textContent, "p-10");
    await r.click(tabs[0]!);
    assert.equal(sectionClass(e), "flex p-4 md:p-8 gap-2");
    await r.click(r.all('[role="tab"]')[3]!);
    assert.equal(sectionClass(e), "flex p-4 md:p-8 gap-2 lg:p-6");
    r.unmount();
  });

  it("select: Headless UI listbox, empty option reads None, picking writes the token", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "md" });
    const writes = countWrites(e);
    const r = render(withEditor(e, <ToolbarItem prop="padding" label="Padding" type="select" valueLabels={P_TOKENS} />));
    const button = r.get("#input-p");
    assert.equal(button.textContent, "p-8");
    await r.click(button);
    const options = r.all('[role="option"]');
    assert.equal(options[0]!.textContent, "None");
    await r.click(options.find((o) => o.textContent === "p-12")!);
    assert.equal(writes.n, 1);
    assert.equal(sectionClass(e), "flex p-4 md:p-12 lg:p-10 gap-2");
    r.unmount();
  });

  it("toggle: writes the `on` token, then clears it", async () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <ToolbarItem prop="display" label="Hidden" type="toggle" on="hidden" option="Hide" />));
    // the section is `flex`: the toggle shows on; switching off clears the display token
    await r.click(r.get('input[type="checkbox"]'));
    assert.equal(sectionClass(e), "p-4 md:p-8 lg:p-10 gap-2");
    r.unmount();
  });

  it("a token outside the group is not written", async () => {
    const e = fixtureEditor();
    const writes = countWrites(e);
    const { r, input } = textRow(e);
    await r.type(input, "gap-4");
    assert.equal(writes.n, 0);
    r.unmount();
  });
});

describe("BreakpointChip (reads the class attribute)", () => {
  const chip = (e: ReturnType<typeof fixtureEditor>, prop = "padding", ghost = false) =>
    render(withEditor(e, <BreakpointChip prop={prop} label="Padding" ghost={ghost} />));

  it("overrides: amber dot, letter of the highest breakpoint, count badge, value tooltip", () => {
    const e = fixtureEditor();
    const r = chip(e);
    const b = r.get("[data-ph-bp-chip]");
    assert.equal(b.getAttribute("data-tooltip-content"), "base: p-4 · md: p-8 · lg: p-10");
    const [dot, letter, badge] = [...b.children] as HTMLElement[];
    assert.ok(dot!.className.includes("bg-amber-500"));
    assert.equal(letter!.textContent, "l");
    assert.equal(badge!.textContent, "2");
    r.unmount();
  });

  it("override at the active breakpoint: primary dot", () => {
    const e = fixtureEditor();
    setUi(e, { view: "md" });
    const r = chip(e);
    assert.ok((r.get("[data-ph-bp-chip]").firstElementChild as HTMLElement).className.includes("bg-primary"));
    r.unmount();
  });

  it("density auto with no override: hidden, or a ghost when asked", () => {
    const e = fixtureEditor();
    let r = chip(e, "gap");
    assert.equal(r.all("[data-ph-bp-chip]").length, 0);
    r.unmount();
    r = chip(e, "gap", true);
    assert.equal(r.get("[data-ph-bp-chip]").getAttribute("data-tooltip-content"), "Click to add a responsive override");
    r.unmount();
  });

  it("density always: hollow ring without a letter; off: nothing", () => {
    const e = fixtureEditor();
    setUi(e, { density: "always" });
    let r = chip(e, "gap");
    const b = r.get("[data-ph-bp-chip]");
    assert.equal(b.children.length, 1);
    assert.ok((b.firstElementChild as HTMLElement).className.includes("opacity-30"));
    r.unmount();
    setUi(e, { density: "off" });
    r = chip(e);
    assert.equal(r.all("[data-ph-bp-chip]").length, 0);
    r.unmount();
  });

  it("never reads dark: or hover: tokens", () => {
    const e = fixtureEditor(`<section class="gap-2 dark:md:gap-4 md:dark:gap-4 hover:gap-6"></section>\n`);
    const r = chip(e, "gap");
    assert.equal(r.all("[data-ph-bp-chip]").length, 0);
    r.unmount();
  });

  it("click toggles the popover state; follows class writes", async () => {
    const e = fixtureEditor();
    const r = chip(e, "gap");
    assert.equal(r.all("[data-ph-bp-chip]").length, 0);
    actRun(e, "classes.set", { group: "gap", token: "gap-8", scopes: [{ breakpoint: "xl" }] });
    const b = r.get("[data-ph-bp-chip]");
    assert.equal(b.getAttribute("aria-expanded"), "false");
    await r.click(b);
    assert.equal(r.get("[data-ph-bp-chip]").getAttribute("aria-expanded"), "true");
    await r.click(r.get("[data-ph-bp-chip]"));
    assert.equal(r.get("[data-ph-bp-chip]").getAttribute("aria-expanded"), "false");
    r.unmount();
  });

  it("sits in the ToolbarItem label gutter", () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <ToolbarItem prop="padding" label="Padding" type="text" />));
    assert.ok(r.get(".group\\/bp-row [data-ph-bp-chip]"));
    r.unmount();
  });
});

describe("SectionOverrideDot", () => {
  const dot = (e: ReturnType<typeof fixtureEditor>, groups: string[]) => render(withEditor(e, <SectionOverrideDot props={groups} />));
  const has = (r: ReturnType<typeof render>) => r.all('[aria-label="Section has breakpoint overrides"]').length === 1;

  it("shows when any group has a non-base override", () => {
    const e = fixtureEditor();
    let r = dot(e, ["gap", "padding"]);
    assert.ok(has(r));
    r.unmount();
    r = dot(e, ["gap"]);
    assert.ok(!has(r));
    actRun(e, "classes.set", { group: "gap", token: "gap-4", scopes: [{ breakpoint: "sm" }] });
    assert.ok(has(r));
    r.unmount();
  });

  it("hidden when density is off or no groups are passed", () => {
    const e = fixtureEditor();
    let r = dot(e, []);
    assert.ok(!has(r));
    r.unmount();
    setUi(e, { density: "off" });
    r = dot(e, ["padding"]);
    assert.ok(!has(r));
    r.unmount();
  });
});

describe("BreakpointChip popover and right-click menu", () => {
  const ui = (e: ReturnType<typeof fixtureEditor>) => e.state.field(uiField);
  const open = async (e: ReturnType<typeof fixtureEditor>) => {
    const r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await r.click(r.get("[data-ph-bp-chip]"));
    return r;
  };
  const menu = async (r: ReturnType<typeof render>) => r.fire(r.get("[data-ph-bp-chip]"), "contextmenu", { clientX: 40, clientY: 40 });
  const item = (r: ReturnType<typeof render>, text: string) => r.all('[role="menuitem"]').find((b) => b.textContent!.startsWith(text)) as HTMLButtonElement;

  it("click opens a 6-cell grid (— when empty); a cell switches the canvas view", async () => {
    const e = fixtureEditor();
    const r = await open(e);
    const cells = r.all("[data-bp-cell]");
    assert.deepEqual(cells.map((c) => c.textContent), ["4", "—", "8", "10", "—", "—"]);
    assert.equal(cells[2]!.getAttribute("data-tooltip-content"), "md: p-8");
    assert.ok(cells[2]!.getAttribute("data-tooltip-id"), "cell tooltips render (the SDK cells had no tooltip id)");
    await r.click(cells[2]!);
    assert.equal(ui(e).view, "md");
    r.unmount();
  });

  it("Alt+click toggles multi-scope (not base) with a clear banner", async () => {
    const e = fixtureEditor();
    const r = await open(e);
    await r.click(r.get('[data-bp-cell="lg"]'), { altKey: true });
    await r.click(r.get('[data-bp-cell="mobile"]'), { altKey: true });
    assert.deepEqual(ui(e).multiScope, ["lg"]);
    assert.ok(r.get("[data-ph-popover]").textContent!.includes("Editing 1 breakpoint together"));
    await r.click(r.all("[data-ph-popover] button").find((b) => b.textContent === "clear")!);
    assert.deepEqual(ui(e).multiScope, []);
    r.unmount();
  });

  it("menu: reset all is one write (one undo step)", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "md" });
    const writes = countWrites(e);
    const r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await menu(r);
    assert.ok(item(r, "Reset at md"));
    await r.click(item(r, "Reset all breakpoints"));
    assert.equal(sectionClass(e), "flex gap-2");
    assert.equal(writes.n, 1);
    assert.equal(r.all('[role="menu"]').length, 0, "closes after an action");
    r.unmount();
  });

  it("menu: promote to base, copy up; disabled without a value at the active layer", async () => {
    let e = fixtureEditor();
    setUi(e, { view: "md" });
    let r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await menu(r);
    await r.click(item(r, "Promote to base"));
    assert.equal(sectionClass(e), "flex p-8 gap-2");
    r.unmount();

    e = fixtureEditor();
    setUi(e, { view: "md" });
    const writes = countWrites(e);
    r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await menu(r);
    await r.click(item(r, "Copy up"));
    const cls = sectionClass(e)!.split(" ");
    for (const t of ["p-4", "md:p-8", "lg:p-8", "xl:p-8", "2xl:p-8"]) assert.ok(cls.includes(t), t);
    assert.equal(writes.n, 1);
    r.unmount();

    e = fixtureEditor();
    setUi(e, { view: "sm" });
    r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await menu(r);
    for (const t of ["Reset at sm", "Promote to base", "Copy down", "Copy up"]) assert.ok(item(r, t).disabled, t);
    assert.ok(!item(r, "Reset all").disabled);
    r.unmount();
  });

  it("Show source opens the popover pulsing the layer the value comes from; Esc closes the menu", async () => {
    const e = fixtureEditor();
    setUi(e, { view: "sm" });
    const r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await menu(r);
    await r.click(item(r, "Show source (base)"));
    assert.ok(r.get('[data-bp-cell="mobile"]').className.includes("animate-pulse"));
    await menu(r);
    const detach = attachKeymap(e, { platform: "other" }); // Esc reaches the overlay stack through the keymap
    await act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    detach();
    assert.equal(r.all('[role="menu"]').length, 0);
    r.unmount();
  });
});

describe("property map → binding", () => {
  it("keys and aliases resolve to their class group; hover keys to the hover state", () => {
    assert.deepEqual([classBinding("padding").group, classBinding("bgColor").group, classBinding("hover.background").state], ["p", "bg-color", "hover"]);
  });
  it("unknown keys and non-class keys throw (no dead controls)", () => {
    assert.throws(() => classBinding("paddng"), /unknown property/);
    const nonClass = PROPERTY_MAP.find((x) => x.home !== "tailwind-class")!;
    assert.throws(() => classBinding(nonClass.key), /is not a class/);
  });
});
