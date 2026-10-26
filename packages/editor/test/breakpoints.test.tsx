import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { scopePrefix } from "@pagehub/engine/kits";
import { AccordionProvider } from "../src/features/toolbar/AccordionContext.tsx";
import { BreakpointChip } from "../src/features/toolbar/breakpoint-chip/BreakpointChip.tsx";
import { DarkVariantToggle } from "../src/features/inspector/InspectorChrome.tsx";
import { ToolbarSection } from "../src/features/toolbar/ToolbarSection.tsx";
import { ToolbarItem } from "../src/features/toolbar/ToolbarItem.tsx";
import { uiField, writeScopes, DEFAULT_UI, type UiState } from "../src/state/uiState.ts";
import { attachKeymap } from "../src/features/keyboard/domKeymap.ts";
import { CHIP_MENU_SIZE } from "../src/features/toolbar/breakpoint-chip/ChipContextMenu.tsx";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { ColorInput } from "../src/features/pickers/ColorInput.tsx";
import { actRun, countWrites, fixtureEditor, render, withEditor } from "./harness.tsx";
import { withSlots } from "./pickersHarness.tsx";

const cls = (e: ReturnType<typeof fixtureEditor>) => e.get("section").attr("class")!.split(/\s+/);
const setUi = (e: ReturnType<typeof fixtureEditor>, ui: Partial<UiState>) => assert.ok(actRun(e, "ui.set", ui));
const uiOf = (e: ReturnType<typeof fixtureEditor>) => e.state.field(uiField);
const ui = (patch: Partial<UiState>): UiState => ({ ...DEFAULT_UI, ...patch });

afterEach(() => {
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

describe("write target and prefix map", () => {
  it("the canvas view is the write target: desktop and mobile write the base layer; sm, md, lg, xl and 2xl write their own prefix", () => {
    const expected = { desktop: "", mobile: "", sm: "sm:", md: "md:", lg: "lg:", xl: "xl:", "2xl": "2xl:" } as const;
    for (const [view, prefix] of Object.entries(expected)) {
      const e = fixtureEditor(`<section class="gap-2"></section>\n`);
      const scopes = writeScopes(ui({ view: view as UiState["view"] }));
      assert.ok(e.run("classes.set", { group: "gap", token: "gap-8", scopes }), view);
      assert.ok(cls(e).includes(`${prefix}gap-8`), `${view} → ${prefix || "base"}`);
    }
  });

  it("prefix chain: breakpoint, then dark, then the state (md:dark:hover:); base is empty", () => {
    assert.equal(scopePrefix({}), "");
    assert.equal(scopePrefix({ breakpoint: "sm" }), "sm:");
    assert.equal(scopePrefix({ breakpoint: "md", dark: true }), "md:dark:");
    assert.equal(scopePrefix({ dark: true }), "dark:");
    assert.equal(scopePrefix({ state: "hover" }), "hover:");
    assert.equal(scopePrefix({ breakpoint: "md", dark: true, state: "hover" }), "md:dark:hover:");
  });

  it("variants: dark chains onto the breakpoint (md:dark:); a hover state ignores the breakpoint (hover:, dark:hover:)", () => {
    const e = fixtureEditor(`<section class="gap-2"></section>\n`);
    e.run("classes.set", { group: "gap", token: "gap-4", scopes: writeScopes(ui({ view: "md", dark: true })) });
    assert.ok(cls(e).includes("md:dark:gap-4"));
    e.run("classes.set", { group: "gap", token: "gap-6", scopes: writeScopes(ui({ view: "lg" }), "hover") });
    assert.ok(cls(e).includes("hover:gap-6"));
    e.run("classes.set", { group: "gap", token: "gap-8", scopes: writeScopes(ui({ view: "lg", dark: true }), "hover") });
    assert.ok(cls(e).includes("dark:hover:gap-8"));
  });

  it("any other state (focus:) is a scope too: no breakpoint, dark chains before it", () => {
    const e = fixtureEditor(`<section class="gap-2"></section>\n`);
    e.run("classes.set", { group: "gap", token: "gap-4", scopes: writeScopes(ui({ view: "xl" }), "focus") });
    e.run("classes.set", { group: "gap", token: "gap-6", scopes: writeScopes(ui({ dark: true }), "focus") });
    assert.deepEqual(cls(e), ["gap-2", "focus:gap-4", "dark:focus:gap-6"]);
  });

  it("an empty value removes only that variant's token", () => {
    const e = fixtureEditor(`<section class="gap-2 md:gap-4 md:dark:gap-6 hover:gap-8"></section>\n`);
    e.run("classes.set", { group: "gap", token: null, scopes: writeScopes(ui({ view: "md" })) });
    assert.deepEqual(cls(e), ["gap-2", "md:dark:gap-6", "hover:gap-8"]);
  });

  it("hover colours are `hover:` class tokens read and written by the same class model as every other control", async () => {
    const e = fixtureEditor(`<section class="bg-base-100 hover:bg-primary"></section>\n`);
    setUi(e, { view: "lg" });
    const r = render(withEditor(e, <ToolbarItem prop="hover.background" label="Background" type="text" />));
    assert.equal((r.get("input#input-bg-color") as HTMLInputElement).value, "bg-primary", "the existing hover token is the row's value");
    await r.type(r.get("input#input-bg-color"), "bg-secondary");
    assert.deepEqual(cls(e), ["bg-base-100", "hover:bg-secondary"]);
    r.unmount();
  });
});

describe("colour picker", () => {
  it("writes through the same scopes as every control: multi-scope picks land on every chosen breakpoint in one write", async () => {
    const e = fixtureEditor(`<section class="flex bg-base-100"></section>\n`);
    setUi(e, { view: "md", multiScope: ["md", "xl"] });
    const Picker = ({ onChange }: { onChange(ref: string): void }) => <button data-stub-pick="" onClick={() => onChange("palette:primary")} />;
    const writes = countWrites(e);
    const r = render(withSlots(e, { ColorPicker: Picker as never }, <ColorInput prop="background" label="Background" />));
    await r.click(r.get("button[aria-haspopup]"));
    await r.click(r.get("[data-stub-pick]"));
    assert.deepEqual(cls(e), ["flex", "bg-base-100", "md:bg-primary", "xl:bg-primary"]);
    assert.equal(writes.n, 1);
    r.unmount();
  });
});

describe("override chip placement", () => {
  it("a section header takes the chip as an action: a ghost when clean, the dot once any property overrides", () => {
    const clean = fixtureEditor(`<section class="gap-2"></section>\n`);
    let r = render(withEditor(clean, <AccordionProvider><ToolbarSection title="Gap" actions={<BreakpointChip prop="gap" label="Gap" ghost />}><span /></ToolbarSection></AccordionProvider>));
    assert.equal(r.get("[data-ph-bp-chip]").getAttribute("data-tooltip-content"), "Click to add a responsive override");
    r.unmount();
    const over = fixtureEditor(`<section class="gap-2 md:gap-4"></section>\n`);
    r = render(withEditor(over, <AccordionProvider><ToolbarSection title="Gap" actions={<BreakpointChip prop="gap" label="Gap" ghost />}><span /></ToolbarSection></AccordionProvider>));
    assert.ok((r.get("[data-ph-bp-chip]").firstElementChild as HTMLElement).className.includes("bg-amber-500"));
    r.unmount();
  });
});

describe("dark variant toggle", () => {
  it("tooltip 'Edit dark: variants' / 'Editing dark: variants'; it only flips the editor's session state (nothing persisted)", () => {
    const off = render(<DarkVariantToggle on={false} onToggle={() => {}} />);
    assert.equal(off.get("[data-dark-toggle]").getAttribute("data-tooltip-content"), "Edit dark: variants");
    off.unmount();
    const on = render(<DarkVariantToggle on onToggle={() => {}} />);
    assert.equal(on.get("[data-dark-toggle]").getAttribute("data-tooltip-content"), "Editing dark: variants");
    on.unmount();
    const a = fixtureEditor();
    setUi(a, { dark: true });
    assert.equal(uiOf(a).dark, true);
    assert.equal(uiOf(fixtureEditor()).dark, false);
  });
});

describe("chip menu", () => {
  const menu = () => document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Breakpoint property actions"]');
  const openMenu = async (r: ReturnType<typeof render>, x = 30, y = 40) => {
    await r.fire(r.get("[data-ph-bp-chip]"), "contextmenu", { clientX: x, clientY: y });
  };

  it("kept inside the window assuming a 220 × 240 menu", async () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await openMenu(r, 99999, 99999);
    assert.equal(menu()!.style.left, `${window.innerWidth - CHIP_MENU_SIZE.width}px`);
    assert.equal(menu()!.style.top, `${window.innerHeight - CHIP_MENU_SIZE.height}px`);
    assert.deepEqual(CHIP_MENU_SIZE, { width: 220, height: 240 });
    r.unmount();
  });

  it("closes on an outside mousedown and on Escape", async () => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await openMenu(r);
    assert.ok(menu());
    await act(() => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    assert.equal(menu(), null);
    await openMenu(r);
    const detach = attachKeymap(e, { platform: "other" }); // Esc reaches the overlay stack through the keymap
    await act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    detach();
    assert.equal(menu(), null);
    r.unmount();
  });

  it("actions write with dark off: dark: tokens are never read or touched", async () => {
    const e = fixtureEditor(`<section class="p-4 md:p-8 dark:md:p-12 md:dark:p-14 dark:p-16"></section>\n`);
    setUi(e, { view: "md", dark: true });
    const r = render(withEditor(e, <BreakpointChip prop="padding" label="Padding" />));
    await openMenu(r);
    const reset = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent!.startsWith("Reset all"))!;
    await r.click(reset);
    assert.deepEqual(cls(e), ["dark:md:p-12", "md:dark:p-14", "dark:p-16"]);
    r.unmount();
  });
});
