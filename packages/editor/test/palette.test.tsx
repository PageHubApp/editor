import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { defineCommand } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { fuzzyScore, searchEntries, type PaletteEntry } from "../src/features/palette/paletteSearch.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { FIXTURE, fixtureEditor, render, type Rendered } from "./harness.tsx";
import { press, wait } from "./keys.ts";

let e: ReturnType<typeof fixtureEditor>;
let r: Rendered;
const open = () => chromeOf(e.state).paletteOpen;
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Search commands"]')!;
const rows = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
const ids = () => rows().map((x) => x.dataset.command);
const row = (id: string) => document.body.querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const type = async (v: string) => {
  const proto = HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input(), v);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const keyOn = (el: Element, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const active = () => document.body.querySelector('[role="option"][aria-selected="true"]') as HTMLElement | null;

async function openPalette() {
  press("ctrl+k");
  await wait(300);
}

beforeEach(() => {
  e = fixtureEditor();
  r = render(<Editor editor={e} platform="other" />);
});
afterEach(() => {
  r.unmount();
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

describe("command palette", () => {
  it("mod+K and palette.toggle flip it open and closed", async () => {
    assert.equal(open(), false);
    assert.equal(press("ctrl+k"), true);
    assert.equal(open(), true);
    await act(async () => void e.run("palette.toggle"));
    assert.equal(open(), false);
  });

  it("mod+K in a regular field is left to the browser; mod+K with the palette's own input focused closes it", async () => {
    const field = document.createElement("input");
    document.body.appendChild(field);
    assert.equal(press("ctrl+k", field), false);
    assert.equal(open(), false);
    await openPalette();
    assert.equal(press("ctrl+k", input()), true);
    assert.equal(open(), false);
  });

  it("is a 600px dialog (max 92vw) hanging 18vh from the top over a bg-black/40 tint with a 2px blur", async () => {
    await openPalette();
    const d = dialog()!;
    assert.ok(d.className.includes("w-[600px]") && d.className.includes("max-w-[92vw]"));
    assert.ok(d.parentElement!.className.includes("pt-[18vh]"));
    assert.ok(d.parentElement!.className.includes("items-start"));
    const backdrops = [...document.body.querySelectorAll<HTMLElement>("[data-modal-backdrop]")];
    assert.ok(backdrops.some((b) => b.className.includes("bg-black/40")));
    assert.ok(backdrops.some((b) => b.style.backdropFilter.includes("2px")));
    assert.equal(d.parentElement!.style.zIndex, "9990");
  });

  it("closes on Escape and on a backdrop click", async () => {
    await openPalette();
    assert.equal(press("Escape", input()), true);
    assert.equal(open(), false);
    await openPalette();
    await r.click(document.body.querySelector("[data-modal-backdrop]")!);
    assert.equal(open(), false);
    assert.equal(e.state.selection.handles.length, 1, "Escape closed the palette, not the selection");
  });

  it("on open the search is empty, the first row is active and the input is focused", async () => {
    await openPalette();
    await type("zz");
    press("Escape", input());
    await wait(300);
    await openPalette();
    assert.equal(input().value, "");
    assert.equal(active()?.dataset.index, "0");
    assert.equal(document.activeElement, input());
  });

  it("the input says 'Type a command…' and typing resets the active row to the first", async () => {
    await openPalette();
    assert.equal(input().placeholder, "Type a command…");
    await keyOn(input(), "ArrowDown");
    assert.equal(active()?.dataset.index, "1");
    await type("c");
    assert.equal(active()?.dataset.index, "0");
  });

  it("lists every registered command that takes no arguments, minus the chrome's own", async () => {
    await openPalette();
    const listed = ids();
    for (const id of ["history.undo", "element.copy", "element.duplicate", "panel.media", "view.toggleGridlines", "file.save", "selection.clear"]) assert.ok(listed.includes(id), id);
    for (const id of ["palette.toggle", "palette.close", "overlay.dismissTop", "contextMenu.open", "ui.set", "preview.exit", "element.insert", "classes.set"]) assert.ok(!listed.includes(id), `${id} is hidden`);
  });

  it("commands that can't run now are greyed at 40% opacity and do nothing on click or Enter", async () => {
    await openPalette();
    const undo = row("history.undo");
    assert.equal(undo.getAttribute("aria-disabled"), "true");
    assert.ok(undo.className.includes("opacity-40"));
    e.select(e.get("h1"));
    await r.click(undo);
    await wait(10);
    assert.equal(open(), true, "a disabled row does not close the palette");
    assert.ok(e.text().includes("Hello"));
  });

  it("fuzzy search: prefix 1000, substring 700 / 500, scattered letters, no match dropped", () => {
    assert.equal(fuzzyScore("del", "Delete"), 1000 - 3);
    assert.equal(fuzzyScore("ete", "Delete"), 500 - 3);
    assert.equal(fuzzyScore("up", "Move up"), 700 - 5);
    const scattered = fuzzyScore("dlt", "Delete")!;
    assert.ok(scattered > 0 && scattered < 500);
    assert.equal(fuzzyScore("zz", "Delete"), null);
  });

  it("searches the title or the category, case-insensitively", async () => {
    await openPalette();
    await type("DUPLI");
    assert.deepEqual(ids(), ["element.duplicate"]);
    await type("navigate");
    assert.ok(ids().length > 3 && ids().every((id) => ["element.selectParent", "element.selectChild", "element.selectNext", "element.selectPrev", "element.moveUp", "element.moveDown", "selection.clear"].includes(id!)));
  });

  it("sorts by score when searching, then category, then title; groups under uppercase category headers", () => {
    const mk = (id: string, title: string, category: string): PaletteEntry => ({ id, title, category, shortcut: null, enabled: true });
    const entries = [mk("a", "Zoom in", "View"), mk("b", "Copy", "Edit"), mk("c", "Delete", "Edit"), mk("d", "Open copy panel", "View")];
    assert.deepEqual(searchEntries(entries, "").map((x) => x.id), ["b", "c", "d", "a"], "no query: category, then title");
    assert.deepEqual(searchEntries(entries, "copy").map((x) => x.id), ["b", "d"], "prefix beats substring");
  });

  it("renders category headers, the title, a category badge and the first binding's shortcut as Ctrl+Z", async () => {
    await openPalette();
    const headers = [...document.body.querySelectorAll<HTMLElement>('[role="listbox"] > div:not([role])')].map((h) => h.textContent);
    assert.ok(headers.includes("Edit") && headers.includes("View") && headers.includes("Navigate"));
    assert.ok(document.body.querySelector('[role="listbox"] > div:not([role])')!.className.includes("uppercase"));
    const undo = row("history.undo");
    assert.match(undo.textContent!, /Undo/);
    assert.match(undo.textContent!, /Edit/);
    assert.equal(undo.querySelector("kbd")!.textContent, "Ctrl+Z");
    assert.equal(row("element.copy").querySelector("kbd")!.textContent, "Ctrl+C");
  });

  it("on macOS shortcuts render as ⌘⇧⌥", async () => {
    r.unmount();
    r = render(<Editor editor={e} platform="mac" />);
    press("meta+k");
    await wait(300);
    assert.equal(row("history.undo").querySelector("kbd")!.textContent, "⌘Z");
    assert.equal(row("panel.media").querySelector("kbd")!.textContent, "⇧⌘M");
  });

  it("commands outside any palette group go under 'Other'", async () => {
    r.unmount();
    const hello = defineCommand({ id: "test.hello", title: "Say hello", run: () => true });
    e = createTestEditor({ files: { "index.liquid": FIXTURE }, extensions: [htmlKit(), tailwindKit(), editorKit(), hello] });
    r = render(<Editor editor={e} platform="other" />);
    await openPalette();
    assert.match(row("test.hello").textContent!, /Other/);
  });

  it("ArrowDown / ArrowUp stop at the ends (no wrap); Home / End jump", async () => {
    await openPalette();
    await keyOn(input(), "ArrowUp");
    assert.equal(active()?.dataset.index, "0");
    await keyOn(input(), "End");
    const last = String(rows().length - 1);
    assert.equal(active()?.dataset.index, last);
    await keyOn(input(), "ArrowDown");
    assert.equal(active()?.dataset.index, last, "no wrap at the end");
    await keyOn(input(), "Home");
    assert.equal(active()?.dataset.index, "0");
    await keyOn(input(), "ArrowDown");
    assert.equal(active()?.dataset.index, "1");
  });

  it("hovering a row makes it active and scrolls it into view", async () => {
    const scrolled: string[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.dataset.index!);
    };
    await openPalette();
    await r.fire(rows()[3]!, "mouseover");
    assert.equal(active()?.dataset.index, "3");
    assert.equal(scrolled.at(-1), "3", `the active row is scrolled into view ${scrolled}`);
  });

  it("Enter closes the palette, then runs the command on the next tick", async () => {
    e.select(e.get("h1"));
    await openPalette();
    await type("duplicate");
    keyOn(input(), "Enter"); // not awaited: act() would flush the timer
    assert.equal(open(), false, "closed first");
    assert.equal(e.find("index.liquid", "h1").length, 1, "not run yet");
    await wait(10);
    assert.equal(e.find("index.liquid", "h1").length, 2);
  });

  it("clicking a row runs its command the same way", async () => {
    await openPalette();
    await r.click(row("view.toggleGridlines"));
    assert.equal(open(), false);
    await wait(10);
    assert.equal(chromeOf(e.state).gridlines, true);
  });

  it("shows 'No commands found for “q”' when nothing matches", async () => {
    await openPalette();
    await type("qqqq");
    assert.equal(rows().length, 0);
    assert.match(dialog()!.textContent!, /No commands found for “qqqq”/);
  });

  it("the footer lists the keys and counts the commands", async () => {
    await openPalette();
    assert.match(dialog()!.textContent!, /↑↓ navigate · ↵ select · esc close/);
    await type("duplicate");
    assert.match(dialog()!.textContent!, /1 command\b/);
    await type("c");
    assert.match(dialog()!.textContent!, /\d+ commands/);
  });
});
