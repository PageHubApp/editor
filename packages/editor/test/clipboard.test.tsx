import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { sharedClassClipboard, sharedClipboard } from "@pagehub/engine/kits";
import { Editor } from "../src/index.ts";
import { attachKeymap } from "../src/features/keyboard/domKeymap.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { richTextOf } from "../src/features/richtext/richTextState.ts";
import { fixtureEditor, render, type Rendered } from "./harness.tsx";
import { press } from "./keys.ts";

const DOC = `<html>\n<body>\n  <section class="flex gap-2">\n    <h1 class="text-xl">Hello</h1>\n    <p>World</p>\n  </section>\n</body>\n</html>\n`;
let e: ReturnType<typeof fixtureEditor>;
let r: Rendered;
let detach = () => {};
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Element actions"]');
const items = () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
const item = (command: string) => document.body.querySelector<HTMLButtonElement>(`[data-command="${command}"]`)!;
const openAt = () => act(() => void e.run("contextMenu.open", { x: 40, y: 50 }));
/** The editor with the keymap attached; `chrome` also renders `<Editor>` (needed for the context menu). */
const mount = (src?: string, chrome = false) => {
  e = fixtureEditor(src);
  if (chrome) r = render(<Editor editor={e} platform="other" />);
  detach = attachKeymap(e, { platform: "other" });
};

beforeEach(() => {
  localStorage.clear();
  sharedClipboard.clear();
  sharedClassClipboard.write("");
  localStorage.clear();
});
afterEach(() => {
  detach();
  r?.unmount();
  r = undefined as never;
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

describe("context menu: clipboard rows", () => {
  it("with nothing copied: no Paste / Paste classes rows (hidden, not disabled) and no Insert ▸ on a text element", async () => {
    mount(undefined, true);
    e.select(e.get("h1"));
    await openAt();
    assert.deepEqual(
      items().map((i) => i.dataset.command ?? `${i.dataset.submenuTrigger}▸`),
      ["selection.clear", "element.copy", "classes.copy", "element.selectParent", "element.moveUp", "element.moveDown", "element.duplicate", "element.remove"],
    );
    assert.equal([...menu()!.children].filter((c) => !c.hasAttribute("role")).length, 3, "dividers between the four groups");
  });

  it("order: Deselect | Copy, Copy classes, Paste, Paste classes | Select parent, Move up, Move down | Duplicate, Delete, once something is copied", async () => {
    mount(DOC, true);
    e.select(e.get("h1"));
    act(() => void e.run("element.copy"));
    act(() => void e.run("classes.copy"));
    e.select(e.get("p"));
    await openAt();
    assert.deepEqual(
      items().map((i) => i.dataset.command ?? `${i.dataset.submenuTrigger}▸`),
      ["selection.clear", "element.copy", "classes.copy", "element.paste", "classes.paste", "element.selectParent", "element.moveUp", "element.moveDown", "element.duplicate", "element.remove"],
    );
    const seq = [...menu()!.children].map((c) => (c.getAttribute("role") === "menuitem" ? (c as HTMLElement).dataset.command : c.hasAttribute("data-submenu") ? "insert▸" : "|"));
    assert.deepEqual(seq.filter((x) => x === "|").length, 3);
    assert.equal(seq.indexOf("|"), 1, "a divider after Deselect");
    assert.equal(seq.indexOf("element.paste") - seq.indexOf("element.copy"), 2, "Copy classes sits between Copy and Paste");
    assert.equal(seq.indexOf("classes.paste") - seq.indexOf("element.paste"), 1, "Paste classes follows Paste");
  });

  it("Copy classes keeps the menu open and stores the classes; Paste classes then replaces the target's classes in one step and closes", async () => {
    mount(DOC, true);
    e.select(e.get("section"));
    await openAt();
    assert.equal(item("classes.paste"), null, "nothing copied yet: the row is hidden");
    await r.click(item("classes.copy"));
    assert.ok(menu(), "the menu stays open");
    assert.deepEqual(JSON.parse(localStorage.getItem("ph-canvas-class-clipboard")!), { className: "flex gap-2" });
    act(() => void e.select(e.get("h1")));
    await act(async () => {});
    assert.equal(item("classes.paste").disabled, false);
    await r.click(item("classes.paste"));
    assert.equal(menu(), null);
    assert.match(e.text(), /<h1 class="flex gap-2">Hello<\/h1>/);
    e.undo();
    assert.match(e.text(), /<h1 class="text-xl">Hello<\/h1>/, "one undo restores the classes");
  });

  it("Copy classes is disabled for an element without classes", async () => {
    mount(DOC, true);
    e.select(e.get("p"));
    await openAt();
    assert.equal(item("classes.copy").disabled, true);
    assert.equal(item("element.copy").disabled, false);
  });
});

describe("copy / duplicate / delete rules on the page", () => {
  it("html, body and delete-locked elements: Copy, Duplicate and Delete are hidden from the menu and the keys pass through", async () => {
    mount(DOC.replace("<p>World</p>", '<p data-edit-lock="delete">World</p>'), true);
    for (const sel of ["html", "body", "p"]) {
      e.select(e.get(sel));
      await openAt();
      for (const c of ["element.copy", "element.duplicate", "element.remove", "classes.paste"]) assert.equal(item(c), null, `${c} on ${sel}`);
      for (const k of ["ctrl+c", "ctrl+d", "Backspace", "Delete"]) assert.equal(press(k), false, `${k} on ${sel} reaches the browser`);
      act(() => void e.run("contextMenu.close"));
    }
  });

  it("Duplicate copies first (the clipboard now holds the duplicated node), so Paste adds another", () => {
    mount();
    e.select(e.get("p"));
    press("ctrl+c");
    e.select(e.get("h1"));
    assert.equal(press("ctrl+d"), true);
    assert.equal(e.find("index.liquid", "h1").length, 2);
    e.select(e.get("p"));
    assert.equal(press("ctrl+v"), true);
    assert.equal(e.find("index.liquid", "h1").length, 3, "the pasted node is the duplicated <h1>");
    assert.equal(e.find("index.liquid", "p").length, 1);
  });

  it("the clipboard outlives an editor: a second editor mounted afterwards pastes what the first copied", () => {
    mount();
    e.select(e.get("h1"));
    assert.equal(press("ctrl+c"), true);
    detach();
    mount();
    e.select(e.get("p"));
    assert.equal(press("ctrl+v"), true);
    assert.match(e.text(), /<p class="text-base">World<\/p>\s*<h1 class="text-xl">Hello<\/h1>/);
  });

  it("Delete selects the parent, asks nothing, and a node the user is typing in dies without a stale write", () => {
    mount();
    e.select(e.get("h1"));
    assert.ok(e.run("richtext.edit"));
    assert.equal(richTextOf(e.state).editing, e.get("h1"));
    assert.ok(e.run("element.remove"), "the toolbar button works while the text is open");
    assert.equal(richTextOf(e.state).editing, null, "the editing session ends with its node");
    assert.equal(e.find("index.liquid", "h1").length, 0);
    assert.equal(e.state.selection.primary, e.get("section"));
    assert.equal(document.querySelector('[role="dialog"], [role="alertdialog"]'), null, "no confirmation");
  });
});
