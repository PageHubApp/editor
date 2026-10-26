import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { ColorInput } from "../src/features/pickers/ColorInput.tsx";
import { ColorPicker, panelPosition } from "../src/features/pickers/ColorPicker.tsx";
import { colorPrefix, refToCss, refToToken, tokenToRef } from "../src/features/pickers/colorValue.ts";
import { countWrites, fixtureEditor, render } from "./harness.tsx";
import { withSlots } from "./pickersHarness.tsx";

const BG = `<section class="flex bg-red-500 p-4"><h1>Hi</h1></section>\n`;
const NONE = `<section class="flex p-4"><h1>Hi</h1></section>\n`;
const sectionClass = (e: ReturnType<typeof fixtureEditor>) => e.get("section").attr("class");
const live: ReturnType<typeof render>[] = [];
afterEach(() => void live.splice(0).forEach((r) => r.container.isConnected && r.unmount()));
const open = async (src: string) => {
  const e = fixtureEditor(src);
  const r = render(withSlots(e, { ColorPicker }, <ColorInput prop="background" label="Background" />));
  live.push(r);
  return { e, r };
};
const trigger = (r: ReturnType<typeof render>) => r.get("button[aria-haspopup]");

beforeEach(() => globalThis.localStorage?.clear());

describe("colour refs", () => {
  it("turn into class tokens and back", () => {
    assert.equal(refToToken("bg", "palette:primary"), "bg-primary");
    assert.equal(refToToken("bg", "#3b82f6"), "bg-[#3b82f6]");
    assert.equal(refToToken("text", "rgba(1, 2, 3, 0.5)"), "text-[rgba(1,2,3,0.5)]");
    assert.equal(refToToken("bg", "blue-500"), "bg-blue-500");
    assert.equal(refToToken("bg", ""), "");
    assert.equal(tokenToRef("bg", "bg-primary/50"), "palette:primary");
    assert.equal(tokenToRef("bg", "bg-blue-500"), "blue-500");
    assert.equal(tokenToRef("bg", "bg-[#abc123]"), "#abc123");
    assert.equal(tokenToRef("bg", "bg-transparent"), "transparent");
    assert.equal(tokenToRef("bg", "bg-cover"), "palette:cover", "group matching, not the ref parser, rules out non-colours");
    assert.equal(colorPrefix("bg-color"), "bg");
    assert.equal(colorPrefix("gradient-from"), "from");
    assert.equal(refToCss("blue-500").startsWith("oklch("), true);
    assert.equal(refToCss("palette:primary", [{ name: "primary", color: "#123456" }]), "#123456");
  });
  it("the panel opens beside its trigger: right of one in the left half, else left", () => {
    assert.deepEqual(panelPosition({ left: 10, right: 90, top: 100 }, 280, 1280), { x: 98, y: 100 });
    assert.deepEqual(panelPosition({ left: 1000, right: 1080, top: 100 }, 280, 1280), { x: 712, y: 100 });
  });
});

describe("ColorInput (connector → classes.set)", () => {
  it("the eyedropper shows only where the browser has one, and writes the sampled colour", async () => {
    const g = globalThis as { EyeDropper?: unknown };
    const none = await open(NONE);
    await none.r.click(trigger(none.r));
    assert.equal(none.r.all("button[aria-label='Pick color from screen']").length, 0);
    none.r.unmount();
    g.EyeDropper = class { open = async () => ({ sRGBHex: "#abcdef" }); };
    try {
      const { e, r } = await open(NONE);
      await r.click(trigger(r));
      await r.click(r.get("button[aria-label='Pick color from screen']"));
      assert.equal(sectionClass(e), "flex p-4 bg-[#abcdef]");
      r.unmount();
    } finally {
      delete g.EyeDropper;
    }
  });

  it("the Sketch picker commits once the drag ends; an alpha below 1 stores rgba", async () => {
    const { e, r } = await open(NONE);
    await r.click(trigger(r));
    const fields = r.all("[role=dialog] input").filter((i) => i.getAttribute("aria-label") !== "Hex colour" && i.getAttribute("aria-label") !== "Search colours");
    assert.ok(fields.length >= 4, "hex, r, g, b, a inputs");
    await r.type(fields.at(-1)!, "50");
    await act(() => new Promise<void>((res) => setTimeout(res, 250)));
    assert.match(sectionClass(e) ?? "", /bg-\[rgba\(\d+,\d+,\d+,0\.5\)\]/);
  });

  it("colour chip: a full swatch when a colour is stored, 'Pick color' otherwise", async () => {
    const a = await open(BG);
    assert.ok(a.r.get("[data-color-fill]"));
    assert.equal(trigger(a.r).getAttribute("aria-label"), "Edit color");
    a.r.unmount();
    const b = await open(NONE);
    assert.equal(trigger(b.r).getAttribute("aria-label"), "Pick color");
    assert.match(b.r.container.textContent ?? "", /Pick color/);
    b.r.unmount();
  });

  it("click toggles the 'Color' panel: 280×540, not persisted, with palette, special, tailwind sections", async () => {
    const { r } = await open(BG);
    await r.click(trigger(r));
    const panel = r.get("[role=dialog]");
    assert.match(panel.textContent ?? "", /^Color/, "titled Color");
    const frame = r.get("[data-ph-floating-panel]");
    assert.equal(frame.style.width, "280px");
    assert.equal(frame.style.height, "540px");
    assert.equal(r.all("[data-resize-edge]").length, 3);
    for (const t of ["Design System", "Special", "Tailwind Colors"]) assert.match(panel.textContent ?? "", new RegExp(t));
    assert.equal(r.all("[role=dialog]").length, 1);
    await r.click(trigger(r));
    assert.equal(r.all("[role=dialog]").length, 0);
    r.unmount();
  });

  it("a palette pick writes bg-<token> once; Tailwind and special picks too", async () => {
    const { e, r } = await open(BG);
    const writes = countWrites(e);
    await r.click(trigger(r));
    await r.click(r.all("button").find((b) => b.textContent === "Primary")!);
    assert.equal(sectionClass(e), "flex bg-primary p-4");
    await r.click(r.get("button[aria-label='Blue 500']"));
    assert.equal(sectionClass(e), "flex bg-blue-500 p-4");
    await r.click(r.get("button[aria-label='Transparent']"));
    assert.equal(sectionClass(e), "flex bg-transparent p-4");
    assert.equal(writes.n, 3);
    r.unmount();
  });

  it("hex field commits on Enter / blur, 6 digits only", async () => {
    const { e, r } = await open(NONE);
    await r.click(trigger(r));
    const hex = r.get("input[aria-label='Hex colour']") as HTMLInputElement;
    await r.type(hex, "#12345");
    await act(async () => void hex.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(sectionClass(e), "flex p-4", "5 digits is ignored");
    await r.type(hex, "#123456");
    await act(async () => void hex.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(sectionClass(e), "flex p-4 bg-[#123456]");
    r.unmount();
  });

  it("Recent keeps the last picks (max 12, persisted as recent-colors) and clears", async () => {
    const { r } = await open(NONE);
    await r.click(trigger(r));
    const recent = () => JSON.parse(globalThis.localStorage.getItem("pagehub-editor:recent-colors") ?? "[]") as string[];
    await r.click(r.get("button[aria-label='Blue 500']"));
    await r.click(r.get("button[aria-label='Blue 500']"));
    assert.deepEqual(recent(), ["blue-500"], "a repeated pick moves to the front, no duplicates");
    for (const s of ["100", "200", "300", "400", "600", "700", "800", "900", "950", "50"]) await r.click(r.get(`button[aria-label='Blue ${s}']`));
    assert.equal(recent().length, 11);
    for (const g of ["Red 500", "Green 500"]) await r.click(r.get(`button[aria-label='${g}']`));
    assert.equal(recent().length, 12, "capped at 12");
    assert.equal(recent()[0], "green-500");
    await r.click(r.get("button[aria-label='Clear recent colours']"));
    assert.equal(globalThis.localStorage.getItem("pagehub-editor:recent-colors"), "[]");
    r.unmount();
  });

  it("Clear (panel) and the chip's X remove the colour class — Clear is disabled when empty", async () => {
    const { e, r } = await open(BG);
    await r.click(trigger(r));
    await r.click(r.get("button[aria-label='Clear color'][class*='border-base-300']"));
    assert.equal(sectionClass(e), "flex p-4");
    assert.equal((r.get("button[aria-label='Clear color'][class*='border-base-300']") as HTMLButtonElement).disabled, true);
    r.unmount();
  });

  it("double-click on a swatch picks and closes the panel", async () => {
    const { e, r } = await open(NONE);
    await r.click(trigger(r));
    const sw = r.get("button[aria-label='Black']");
    await r.click(sw);
    await r.fire(sw, "dblclick");
    assert.equal(sectionClass(e), "flex p-4 bg-black");
    assert.equal(r.all("[role=dialog]").length, 0);
    r.unmount();
  });
});
