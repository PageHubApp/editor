import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { UniversalInput } from "../src/features/toolbar/UniversalInput.tsx";
import { UniversalInput as UniversalInputView } from "../src/features/toolbar/universal/UniversalInput.tsx";
import { sidePosition } from "../src/features/toolbar/universal/UniversalPanels.tsx";
import { TYPE_ORDER, composeValue, parseValue, switchType, tokenToValue, typeInto, valueToToken } from "../src/features/toolbar/universal/universalValue.ts";
import { countWrites, fixtureEditor, render, withEditor } from "./harness.tsx";

const SRC = `<section class="flex w-4 p-4"><h1>Hi</h1></section>\n`;
const live: ReturnType<typeof render>[] = [];
afterEach(() => void live.splice(0).forEach((r) => r.unmount()));
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const cls = (e: ReturnType<typeof fixtureEditor>) => e.get("section").attr("class") ?? "";
const focus = (el: HTMLElement) => act(async () => void el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
const key = (el: Element, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
const blur = (el: HTMLElement, to?: HTMLElement) => act(async () => void el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to ?? null })));

function rig(props: Record<string, unknown> = {}, src = SRC) {
  const e = fixtureEditor(src);
  const r = render(withEditor(e, <UniversalInput prop="width" label="Width" prefix="w" options={["w-full", "w-1/2", "w-auto"]} {...props} />));
  live.push(r);
  return { e, r, input: r.get("input[aria-label='Width']") as HTMLInputElement, writes: countWrites(e) };
}
const options = (r: ReturnType<typeof render>) => r.all("[data-unified-dropdown] [role=option]").map((o) => o.textContent);
// the type menu is a glyph-only 3-col grid; each cell carries its type id as `data-type`
const menuItem = (r: ReturnType<typeof render>, name: string) => r.all("[role=menuitem]").find((m) => m.getAttribute("data-type") === name)!;
const menuTypes = (r: ReturnType<typeof render>) => r.all("[role=menuitem]").map((m) => m.getAttribute("data-type"));

describe("universal input — pure rules", () => {
  it("a typed unit switches the type and keeps the number", () => {
    assert.deepEqual(typeInto("10px", "tailwind"), { type: "px", text: "10" });
    assert.deepEqual(typeInto("-2.5rem", "px"), { type: "rem", text: "-2.5" });
    assert.deepEqual(parseValue("10px"), { type: "px", text: "10" });
    assert.equal(composeValue("px", "10"), "10px");
    assert.equal(composeValue("tailwind", "w-4"), "w-4");
  });
  it("numeric types refuse stray characters, allow unit prefixes, and cap %-like units at -200…1000", () => {
    assert.equal(typeInto("12x", "px"), null);
    assert.equal(typeInto("12p", "px")?.text, "12p");
    assert.equal(typeInto("1.5", "rem")?.text, "1.5");
    assert.equal(typeInto("2000", "%"), null);
    assert.equal(typeInto("-300", "vh"), null);
    assert.equal(typeInto("2000", "px")?.text, "2000", "px is unbounded");
  });
  it("`word-` switches to Tailwind and opens the autocomplete (except inside calc)", () => {
    assert.deepEqual(typeInto("w-", "px"), { type: "tailwind", text: "w-", autocomplete: true });
    assert.deepEqual(typeInto("flex-", "tailwind"), { type: "tailwind", text: "flex-", autocomplete: true });
    assert.equal(typeInto("calc-", "calc")?.type, "calc");
  });
  it("type order, and switching keeps the number only between units", () => {
    assert.deepEqual(TYPE_ORDER, ["calc", "var", "tailwind", "em", "px", "rem", "%", "vh", "vw", "vmin", "vmax"]);
    assert.equal(switchType("px", "rem", "10"), "10");
    assert.equal(switchType("px", "tailwind", "10"), "");
    assert.equal(switchType("tailwind", "px", "w-4"), "");
  });
  it("tokens: value ↔ class", () => {
    assert.equal(valueToToken("w", "10px"), "w-[10px]");
    assert.equal(valueToToken("w", "w-1/2"), "w-1/2");
    assert.equal(valueToToken("w", "calc(100% - 2rem)"), "w-[calc(100%_-_2rem)]");
    assert.equal(tokenToValue("w", "w-[calc(100%_-_2rem)]"), "calc(100% - 2rem)");
    assert.equal(tokenToValue("w", "w-4"), "w-4");
  });
});

describe("UniversalInput (connector → classes.set)", () => {
  it("shows the stored class; the type chip marks the type", () => {
    const { r, input } = rig();
    // Idle display is the humanized token ("w-4" → "4"), like the real editor's formatTailwindDisplayLabel.
    assert.equal(input.value, "4");
    // The type indicator is a glyph (the Tailwind icon), named via aria-label — not literal text.
    const chip = r.get("button[aria-label='Value type: tailwind']");
    assert.ok(chip.querySelector("svg"), "tailwind type shows an icon glyph");
  });

  it("focus opens the autocomplete when there are options; ↑/↓ only move the highlight and never write", async () => {
    const { r, input, writes } = rig();
    await focus(input);
    assert.deepEqual(options(r), ["w-full", "w-1/2", "w-auto"]);
    const active = () => r.all("[data-unified-dropdown] [aria-selected=true]").map((o) => o.textContent);
    assert.deepEqual(active(), ["w-full"]);
    await key(input, "ArrowDown");
    assert.deepEqual(active(), ["w-1/2"]);
    await key(input, "ArrowDown");
    await key(input, "ArrowDown");
    assert.deepEqual(active(), ["w-auto"], "clamped at the end");
    await key(input, "ArrowUp");
    assert.deepEqual(active(), ["w-1/2"]);
    assert.equal(input.value, "w-4", "the value is never stepped");
    assert.equal(writes.n, 0);
  });

  it("no options and no variables: focus opens nothing", async () => {
    const { r, input } = rig({ options: [] });
    await focus(input);
    assert.equal(r.all("[data-unified-dropdown]").length, 0);
  });

  it("Enter picks the highlighted option and blurs", async () => {
    const { e, r, input, writes } = rig({ options: ["w-full", "w-1/2"] });
    await r.type(input, "w-");
    await key(input, "Enter");
    assert.equal(cls(e), "flex w-full p-4");
    assert.equal(writes.n, 1);
  });

  it("Enter without an autocomplete commits the typed value", async () => {
    const { e, r, input } = rig({ options: [] });
    await r.type(input, "12px");
    await key(input, "Enter");
    assert.match(cls(e), /w-\[12px\]/);
  });

  it("Escape closes the autocomplete and restores the stored value", async () => {
    const { r, input, writes } = rig();
    await r.type(input, "w-1");
    assert.ok(options(r).length > 0);
    await key(input, "Escape");
    assert.equal(r.all("[data-unified-dropdown]").length, 0);
    assert.equal(input.value, "4"); // reverted to the stored value's idle (humanized) display
    assert.equal(writes.n, 0);
  });

  it("Enter commits and blurs; Escape reverts and blurs — also with no autocomplete open", async () => {
    const { e, r, input, writes } = rig({ options: [] });
    input.focus();
    await r.type(input, "12px");
    assert.equal(document.activeElement, input);
    await key(input, "Escape");
    assert.equal(input.value, "4", "reverted to the stored value (idle humanized display)");
    assert.equal(document.activeElement === input, false, "blurred");
    assert.equal(writes.n, 0);
    input.focus();
    await r.type(input, "12px");
    await key(input, "Enter");
    assert.match(cls(e), /w-\[12px\]/);
    assert.equal(document.activeElement === input, false, "blurred after the commit");
  });

  it("blur commits after 200ms when changed; focus moving into the dropdown does not", async () => {
    const { e, r, input, writes } = rig();
    await r.type(input, "w-1/2");
    await blur(input, r.get("[data-unified-dropdown] button"));
    await wait(260);
    assert.equal(writes.n, 0, "focus went into the dropdown");
    await blur(input);
    await wait(100);
    assert.equal(writes.n, 0, "not before 200ms");
    await wait(160);
    assert.equal(cls(e), "flex w-1/2 p-4");
  });

  it("blur with nothing changed writes nothing", async () => {
    const { input, writes } = rig();
    await focus(input);
    await blur(input);
    await wait(260);
    assert.equal(writes.n, 0);
  });

  it("typing 10px switches the unit chip and keeps the number; commit writes w-[10px]", async () => {
    const { e, r, input } = rig({ options: [] });
    await r.type(input, "10px");
    assert.equal(input.value, "10");
    assert.equal(r.get("button[aria-label='Value type: px']").textContent, "px");
    await key(input, "Enter");
    assert.match(cls(e), /w-\[10px\]/);
  });

  it("invalid characters are refused in numeric types", async () => {
    const { r, input } = rig({ options: [] }, `<section class="w-[10px]"></section>\n`);
    assert.equal(input.value, "10");
    await r.type(input, "10x");
    assert.equal(input.value, "10");
    await r.type(input, "10.5");
    assert.equal(input.value, "10.5");
  });

  it("the type menu lists the types in order; px → rem keeps the number, px → tailwind clears it", async () => {
    const { r, input } = rig({ options: [] }, `<section class="w-[10px]"></section>\n`);
    await r.click(r.get("button[aria-label='Value type: px']"));
    assert.deepEqual(menuTypes(r), [...TYPE_ORDER]);
    await r.click(menuItem(r, "rem"));
    assert.equal(input.value, "10");
    await r.click(r.get("button[aria-label='Value type: rem']"));
    await r.click(menuItem(r, "tailwind"));
    assert.equal(input.value, "");
  });

  it("allowedTypes filters the menu", async () => {
    const { r } = rig({ allowedTypes: ["px", "rem"] });
    await r.click(r.get("button[aria-label^='Value type']"));
    assert.deepEqual(menuTypes(r), ["rem", "px"].sort((a, b) => TYPE_ORDER.indexOf(a as never) - TYPE_ORDER.indexOf(b as never)));
  });

  it("calc opens a panel; Apply writes the expression", async () => {
    const { e, r } = rig();
    await r.click(r.get("button[aria-label^='Value type']"));
    await r.click(menuItem(r, "calc"));
    assert.match(r.get("[role=dialog]").textContent ?? "", /CSS Function/);
    await r.type(r.get("textarea[aria-label='calc expression']"), "100% - 2rem");
    await r.click(r.all("button").find((b) => b.textContent === "Apply")!);
    assert.match(cls(e), /w-\[calc\(100%_-_2rem\)\]/);
    assert.equal(r.all("[role=dialog]").length, 0);
  });

  it("var opens the Design Variables panel; picking writes it and closes", async () => {
    const { e, r } = rig({ variables: [{ name: "--space-md", label: "Space md", value: "1rem" }] });
    await r.click(r.get("button[aria-label^='Value type']"));
    await r.click(menuItem(r, "var"));
    assert.match(r.get("[role=dialog]").textContent ?? "", /^Design Variables/);
    await r.click(r.all("[role=dialog] button").find((b) => b.textContent?.includes("Space md"))!);
    assert.match(cls(e), /w-\[var\(--space-md\)\]/);
    assert.equal(r.all("[role=dialog]").length, 0);
  });

  it("the variable picker has Design Variables / New Token / Edit Token stages when the host saves tokens; Save returns to the list", async () => {
    const saved: Array<[string, unknown]> = [];
    const { r } = rig({ variables: [{ name: "--space-md", label: "Space md", value: "1rem" }], onCreateVariable: (t: unknown) => saved.push(["new", t]), onUpdateVariable: (t: unknown) => saved.push(["edit", t]) });
    await r.click(r.get("button[aria-label^='Value type']"));
    await r.click(menuItem(r, "var"));
    const title = () => r.get("[role=dialog]").textContent ?? "";
    assert.match(title(), /^Design Variables/);
    const button = (name: string) => r.all("[role=dialog] button").find((b) => b.textContent === name || b.getAttribute("aria-label") === name)!;
    await r.click(button("New token"));
    assert.match(title(), /^New Token/);
    const name = () => r.get("input[aria-label='Token name']") as HTMLInputElement;
    assert.equal((button("Save") as HTMLButtonElement).disabled, true, "needs a --name and a value");
    await r.type(name(), "--brand");
    await r.type(r.get("input[aria-label='Token value']"), "#f00");
    await r.click(button("Save"));
    assert.deepEqual(saved, [["new", { name: "--brand", value: "#f00" }]]);
    assert.match(title(), /^Design Variables/, "back to the list");
    await r.click(button("Edit Space md"));
    assert.match(title(), /^Edit Token/);
    assert.equal(name().readOnly, true, "a token's name is fixed");
    assert.equal((r.get("input[aria-label='Token value']") as HTMLInputElement).value, "1rem");
    await r.click(button("Cancel"));
    assert.match(title(), /^Design Variables/);
    assert.equal(saved.length, 1);
  });

  it("without host callbacks the picker is the plain list (no New / Edit)", async () => {
    const { r } = rig({ variables: [{ name: "--a" }] });
    await r.click(r.get("button[aria-label^='Value type']"));
    await r.click(menuItem(r, "var"));
    assert.equal(r.all("[role=dialog] button").some((b) => /New token|Edit/.test(b.textContent ?? "")), false);
  });

  it("clicks on the input or the type chip don't dismiss the variable picker", async () => {
    const { r, input } = rig({ variables: [{ name: "--a" }] });
    await r.click(r.get("button[aria-label^='Value type']"));
    await r.click(menuItem(r, "var"));
    assert.equal(r.all("[role=dialog]").length, 1);
    await wait(50); // outside clicks are armed a frame after opening
    await act(async () => void input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    await r.click(input);
    assert.equal(r.all("[role=dialog]").length, 1, "the input");
    const chip = r.get("button[aria-label^='Value type']");
    await act(async () => void chip.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(r.all("[role=dialog]").length, 1, "the type chip");
    await act(async () => void document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(r.all("[role=dialog]").length, 0, "anywhere else still closes it");
  });

  it("the picker opens right of the type chip if it fits, else left", () => {
    const chip = (left: number) => ({ getBoundingClientRect: () => ({ left, right: left + 40, top: 100 }) }) as unknown as HTMLElement;
    const w = window.innerWidth;
    assert.equal(sidePosition(chip(10), 280)!.x, 10 + 40 + 8, "room on the right");
    assert.equal(sidePosition(chip(w - 60), 280)!.x, w - 60 - 280 - 8, "no room: to the left");
  });

  it("variables appear in the autocomplete as var(…) options", async () => {
    const { e, r, input } = rig({ options: [], variables: [{ name: "--gap" }] });
    await focus(input);
    assert.deepEqual(options(r), ["var(--gap)"]);
    await r.click(r.all("[data-unified-dropdown] button")[0]!);
    assert.match(cls(e), /w-\[var\(--gap\)\]/);
  });

  it("Clear writes an empty value and shows only with a value; a swatch can precede the text", async () => {
    const { e, r } = rig();
    await r.click(r.get("button[aria-label='Clear value']"));
    assert.equal(cls(e), "flex p-4");
    assert.equal(r.all("button[aria-label='Clear value']").length, 0);
    const s = render(<UniversalInputView value="" onChange={() => {}} swatch="#ff0000" />);
    live.push(s);
    assert.ok(s.get("[data-universal-swatch]"));
  });
});
