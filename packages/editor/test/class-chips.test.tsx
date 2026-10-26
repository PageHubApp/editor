import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { header, inspector, pageEditor, section, select } from "./inspectorFixture.tsx";

afterEach(() => localStorage.clear());

const make = (src: string) => createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), liquidKit()] });

describe("classes.remove", () => {
  it("removes one exact token (prefixes included) as one undo step", () => {
    const src = `<div class="p-4 md:p-8 hover:bg-primary">x</div>\n`;
    const e = make(src);
    e.select(e.get("div"));
    assert.ok(e.run("classes.remove", { token: "md:p-8" }));
    assert.equal(e.text(), `<div class="p-4 hover:bg-primary">x</div>\n`);
    assert.ok(e.undo());
    assert.equal(e.text(), src);
  });
  it("drops the attribute with the last token; refuses unknown tokens, Liquid classes and no selection", () => {
    const e = make(`<div class="p-4">x</div>\n<p class="a {{ b }}">y</p>\n`);
    e.select(e.get("div"));
    assert.equal(e.can("classes.remove", { token: "nope" }), false);
    assert.ok(e.run("classes.remove", { token: "p-4" }));
    assert.match(e.text(), /^<div>x<\/div>/);
    e.select(e.get("p"));
    assert.equal(e.can("classes.remove", { token: "a" }), false);
    e.run("selection.clear");
    assert.equal(e.can("classes.remove", { token: "a" }), false);
  });
});

describe("Classes row chips", () => {
  it("right-click on a chip removes that class", async () => {
    const e = pageEditor({ "index.liquid": `<section class="flex p-4 md:p-8">x</section>\n` });
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "custom-css"));
    const chips = () => [...section(r, "custom-css")!.querySelectorAll<HTMLElement>("[data-class-chip]")].map((c) => c.dataset.classChip);
    assert.deepEqual(chips(), ["flex", "p-4", "md:p-8"]);
    const chip = section(r, "custom-css")!.querySelector<HTMLElement>('[data-class-chip="p-4"]')!;
    await act(async () => void chip.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    assert.deepEqual(chips(), ["flex", "md:p-8"]);
    await act(async () => void assert.ok(e.undo()));
    assert.deepEqual(chips(), ["flex", "p-4", "md:p-8"]);
    r.unmount();
  });
});

describe("Classes row chip gestures", () => {
  async function open(src: string) {
    const e = pageEditor({ "index.liquid": src });
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "custom-css"));
    const host = () => section(r, "custom-css")!;
    const chip = (t: string) => host().querySelector<HTMLElement>(`[data-class-chip="${t}"]`)!;
    const layer = (l: string) => host().querySelector<HTMLElement>(`[data-class-layer="${l}"]`)!;
    const chips = () => [...host().querySelectorAll<HTMLElement>("[data-class-chip]")].map((c) => c.dataset.classChip);
    const fire = (el: Element, ev: Event) => act(async () => void el.dispatchEvent(ev));
    const ptr = (type: string, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, cancelable: true, buttons: 1, ...init });
    /** A pointer drag of `from` over `over` (the pointer travels there), released on `drop` (default: `over`). */
    const drag = async (from: Element, over: Element, init: MouseEventInit = {}, drop: Element = over) => {
      await fire(from, ptr("pointerdown", { clientX: 0, clientY: 0 }));
      await fire(over, ptr("pointermove", { clientX: 40, clientY: 40, ...init }));
      await fire(drop, ptr("pointerup", { clientX: 40, clientY: 40, buttons: 0, ...init }));
    };
    return { e, r, chip, layer, chips, fire, ptr, drag };
  }

  it("click copies the class to the clipboard", async () => {
    const copied: string[] = [];
    const saved = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (t: string) => void copied.push(t) }, configurable: true });
    const { r, chip } = await open(`<section class="flex p-4">x</section>\n`);
    await r.click(chip("p-4"));
    assert.deepEqual(copied, ["p-4"]);
    if (saved) Object.defineProperty(globalThis.navigator, "clipboard", saved);
    r.unmount();
  });

  it("Shift+click arms a copy; the next breakpoint button copies the class there", async () => {
    const { e, r, chip, layer, chips } = await open(`<section class="flex p-4">x</section>\n`);
    await r.click(chip("p-4"), { shiftKey: true });
    assert.equal(chip("p-4").hasAttribute("data-armed"), true);
    await r.click(layer("md"));
    assert.deepEqual(chips(), ["flex", "p-4", "md:p-4"]);
    assert.equal(chip("p-4").hasAttribute("data-armed"), false, "disarmed after the copy");
    await act(async () => void assert.ok(e.undo()));
    assert.deepEqual(chips(), ["flex", "p-4"], "one undo step");
    r.unmount();
  });

  it("drag to a breakpoint moves the class there, replacing that layer's token of the same property; Shift+drag copies", async () => {
    const { r, chip, layer, chips, drag } = await open(`<section class="flex p-4 md:p-8">x</section>\n`);
    await drag(chip("p-4"), layer("md"));
    assert.deepEqual(chips(), ["flex", "md:p-4"], "moved: base p-4 gone, md:p-8 replaced");
    await drag(chip("md:p-4"), layer("lg"), { shiftKey: true });
    assert.deepEqual(chips(), ["flex", "md:p-4", "lg:p-4"], "Shift keeps the original");
    await drag(chip("md:p-4"), layer("md"));
    assert.deepEqual(chips(), ["flex", "md:p-4", "lg:p-4"], "dropping on its own layer is a no-op");
    r.unmount();
  });

  it("a move and a Shift+drag copy are each one undo step", async () => {
    const { e, r, chip, layer, chips, drag } = await open(`<section class="flex p-4">x</section>\n`);
    await drag(chip("p-4"), layer("md"));
    assert.deepEqual(chips(), ["flex", "md:p-4"]);
    await act(async () => void assert.ok(e.undo()));
    assert.deepEqual(chips(), ["flex", "p-4"], "move undone in one step");
    await drag(chip("p-4"), layer("lg"), { shiftKey: true });
    assert.deepEqual(chips(), ["flex", "p-4", "lg:p-4"]);
    await act(async () => void assert.ok(e.undo()));
    assert.deepEqual(chips(), ["flex", "p-4"], "copy undone in one step");
    r.unmount();
  });

  it("a drag over the chip's own layer shows the invalid state; a valid layer shows none; a window blur cancels without writing", async () => {
    const { r, chip, layer, chips, fire, ptr } = await open(`<section class="flex md:p-8">x</section>\n`);
    await fire(chip("md:p-8"), ptr("pointerdown", { clientX: 0, clientY: 0 }));
    await fire(layer("md"), ptr("pointermove", { clientX: 40, clientY: 40 }));
    assert.equal(layer("md").hasAttribute("data-invalid"), true);
    await fire(layer("lg"), ptr("pointermove", { clientX: 50, clientY: 40 }));
    assert.equal(layer("md").hasAttribute("data-invalid"), false);
    assert.equal(layer("lg").hasAttribute("data-invalid"), false);
    await act(async () => void window.dispatchEvent(new Event("blur")));
    await fire(layer("lg"), ptr("pointerup", { buttons: 0 }));
    assert.deepEqual(chips(), ["flex", "md:p-8"], "cancelled: nothing moved");
    r.unmount();
  });

  it("a pointer released outside the editor (buttons 0 on move) ends the drag; a right-button press never starts one", async () => {
    const { r, chip, layer, chips, fire, ptr } = await open(`<section class="flex p-4">x</section>\n`);
    await fire(chip("p-4"), ptr("pointerdown", { button: 2 }));
    await fire(layer("md"), ptr("pointermove", { clientX: 40, clientY: 40 }));
    await fire(layer("md"), ptr("pointerup", { buttons: 0 }));
    assert.deepEqual(chips(), ["flex", "p-4"]);
    await fire(chip("p-4"), ptr("pointerdown"));
    await fire(layer("md"), ptr("pointermove", { clientX: 40, buttons: 0 }));
    await fire(layer("md"), ptr("pointerup", { clientX: 40, buttons: 0 }));
    assert.deepEqual(chips(), ["flex", "p-4"], "implicit end, no move");
    r.unmount();
  });

  it("dark and state prefixes survive a move", async () => {
    const { r, chip, layer, chips, drag } = await open(`<section class="md:dark:hover:p-4">x</section>\n`);
    await drag(chip("md:dark:hover:p-4"), layer("base"));
    assert.deepEqual(chips(), ["dark:hover:p-4"]);
    r.unmount();
  });

  it("Ctrl+right-click removes the class and its linked classes (the same property at every breakpoint); plain right-click only the one", async () => {
    const { e, r, chip, chips, fire } = await open(`<section class="flex p-4 md:p-8 dark:p-2 gap-2">x</section>\n`);
    await fire(chip("p-4"), new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ctrlKey: true }));
    assert.deepEqual(chips(), ["flex", "gap-2"]);
    await act(async () => void assert.ok(e.undo()));
    assert.deepEqual(chips(), ["flex", "p-4", "md:p-8", "dark:p-2", "gap-2"], "one undo step");
    await fire(chip("p-4"), new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    assert.deepEqual(chips(), ["flex", "md:p-8", "dark:p-2", "gap-2"]);
    r.unmount();
  });
});

describe("Classes add-class input", () => {
  async function open(src: string) {
    const e = pageEditor({ "index.liquid": src });
    select(e, "section");
    const r = inspector(e);
    await r.click(header(r, "custom-css"));
    const host = () => section(r, "custom-css")!;
    const input = () => host().querySelector<HTMLInputElement>("[data-class-input]")!;
    const layer = (l: string) => host().querySelector<HTMLElement>(`[data-class-layer="${l}"]`)!;
    const chips = () => [...host().querySelectorAll<HTMLElement>("[data-class-chip]")].map((c) => c.dataset.classChip);
    const enter = () => act(async () => void input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    return { e, r, input, layer, chips, enter, host };
  }

  it("typing a class and pressing Enter adds it at the base layer", async () => {
    const { e, r, input, chips, enter } = await open(`<section class="flex">x</section>\n`);
    await r.type(input(), "rounded-lg");
    await enter();
    assert.deepEqual(chips(), ["flex", "rounded-lg"]);
    assert.match(e.text(), /class="flex rounded-lg"/);
    r.unmount();
  });

  it("selecting a breakpoint scopes a bare class to that layer (writes md:)", async () => {
    const { e, r, input, layer, chips, enter, host } = await open(`<section class="flex">x</section>\n`);
    await r.click(layer("md"));
    assert.equal(layer("md").hasAttribute("data-active"), true, "MD is the active scope");
    assert.match(host().querySelector("[data-add-scope-label]")!.textContent!, /MD/);
    await r.type(input(), "grid");
    await enter();
    assert.deepEqual(chips(), ["flex", "md:grid"], "bare class written at the md layer");
    assert.match(e.text(), /class="flex md:grid"/);
    r.unmount();
  });

  it("a prefix the user types wins over the selected scope and resolves conflicts in that layer", async () => {
    const { e, r, input, chips, enter } = await open(`<section class="p-4 lg:p-8">x</section>\n`);
    await r.type(input(), "lg:p-10");
    await enter();
    assert.deepEqual(chips(), ["p-4", "lg:p-10"], "lg:p-8 replaced, not duplicated");
    assert.match(e.text(), /class="p-4 lg:p-10"/);
    r.unmount();
  });

  it("an unknown token is appended verbatim to the class attribute", async () => {
    const { e, r, input, chips, enter } = await open(`<section class="flex">x</section>\n`);
    await r.type(input(), "ph-custom-thing");
    await enter();
    assert.deepEqual(chips(), ["flex", "ph-custom-thing"]);
    assert.match(e.text(), /class="flex ph-custom-thing"/);
    r.unmount();
  });
});

