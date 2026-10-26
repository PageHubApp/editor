import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { defineCommand } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { aiChatFacet } from "../src/features/menus/aiChat.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { mountCanvas } from "./canvasHarness.tsx";
import { fireIn } from "./canvasHarness.tsx";
import { render, type Rendered } from "./harness.tsx";
import { press, wait } from "./keys.ts";

const DOC = `<html>\n<body>\n  <main class="p-4">\n    <section class="flex gap-2">\n      <h1 class="text-xl">Hello</h1>\n      <p>World</p>\n    </section>\n  </main>\n</body>\n</html>\n`;
let e: TestEditor;
let r: Rendered;
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Element actions"]');
const sub = () => document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Insert"]');
const flyout = () => document.body.querySelector<HTMLElement>('[data-flyout="components"]');
const item = (command: string) => document.body.querySelector<HTMLButtonElement>(`[data-command="${command}"]`)!;
const trigger = () => document.body.querySelector<HTMLElement>('[data-submenu-trigger="insert"]')!;
const wrap = () => document.body.querySelector<HTMLElement>('[data-submenu="insert"]')!;
const open = () => act(() => void e.run("contextMenu.open", { x: 40, y: 50 }));
const enter = (el: Element) => r.fire(el, "mouseover", { relatedTarget: document.body });
const leave = (el: Element) => r.fire(el, "mouseout", { relatedTarget: document.body });
const mount = (extra: object[] = [], src = DOC) => {
  e = createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), editorKit(), ...extra] as never });
  r = render(<Editor editor={e} platform="other" />);
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  r?.unmount();
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

describe("context menu: Insert ▸ submenu", () => {
  it("order: Deselect | Copy … | Select parent, Move up, Move down | Insert ▸ | Duplicate … Delete; Insert ▸ is a submenu row, only on a section or container", async () => {
    mount();
    const seq = () => [...menu()!.children].map((c) => (c.getAttribute("role") === "menuitem" ? ((c as HTMLElement).dataset.command ?? (c as HTMLElement).dataset.submenuTrigger) : c.getAttribute("data-submenu") ? "insert▸" : "|"));
    e.select(e.get("section"));
    await open();
    assert.deepEqual(seq(), ["selection.clear", "|", "element.copy", "classes.copy", "|", "element.selectParent", "element.moveUp", "element.moveDown", "|", "insert▸", "|", "element.duplicate", "element.remove"]);
    await act(async () => void e.run("contextMenu.close"));
    e.select(e.get("h1"));
    await open();
    assert.deepEqual(seq(), ["selection.clear", "|", "element.copy", "classes.copy", "|", "element.selectParent", "element.moveUp", "element.moveDown", "|", "element.duplicate", "element.remove"], "a text element has no Insert ▸");
  });

  it("opens on hover (right of the row) with the rows that apply (Insert component ▸, Add container on a section)", async () => {
    mount();
    e.select(e.get("section"));
    await open();
    assert.equal(sub(), null);
    await enter(wrap());
    assert.ok(sub(), "hover opens it");
    assert.ok(sub()!.className.includes("left-full"), "placed right-start");
    assert.deepEqual([...sub()!.querySelectorAll<HTMLElement>("[data-command]")].map((i) => i.dataset.command), ["insert.component", "element.addContainer"], "no block source from the host and a section is not a page: those rows are hidden");
    assert.equal(item("element.addContainer").disabled, false);
  });

  it("closes 160ms after the pointer leaves; coming back in time keeps it open", async () => {
    mount();
    e.select(e.get("section"));
    await open();
    await enter(wrap());
    await leave(wrap());
    await wait(80);
    assert.ok(sub(), "still open inside the grace");
    await enter(wrap());
    await wait(200);
    assert.ok(sub(), "re-entering cancelled the close");
    await leave(wrap());
    await wait(240);
    assert.equal(sub(), null);
    assert.ok(menu(), "the menu itself stays");
  });

  it("clicking the Insert row opens it too (keyboard / touch)", async () => {
    mount();
    e.select(e.get("section"));
    await open();
    await r.click(trigger());
    assert.ok(sub());
  });

  it("Add empty section is enabled on a page and appends a section; Add container appends a div to a container; each is one undo step and the menu closes", async () => {
    mount();
    e.select(e.get("main"));
    await open();
    await enter(wrap());
    assert.equal(item("element.addContainer"), null, "a page takes sections");
    await r.click(item("element.addSection"));
    assert.equal(menu(), null);
    assert.match(e.text(), /<section class="gap-section flex w-full flex-col"><\/section>\s*<\/main>/);
    assert.ok(e.undo());
    assert.ok(!e.text().includes("gap-section"));
    e.select(e.get("section"));
    await open();
    await enter(wrap());
    await r.click(item("element.addContainer"));
    assert.match(e.text(), /<div class="gap-section flex w-full flex-col"><\/div>\s*<\/section>/);
  });
});

describe("context menu: Insert component flyout", () => {
  const openFlyout = async () => {
    e.select(e.get("section"));
    await open();
    await enter(wrap());
    await enter(item("insert.component").parentElement!);
  };

  it("a 280×360 flyout with search, category headers and 'Open components tab'; the row is enabled on a section, container or page only", async () => {
    mount();
    await openFlyout();
    const f = flyout()!;
    assert.equal(f.style.width, "280px");
    assert.equal(f.style.height, "360px");
    assert.ok(f.querySelector('input[aria-label="Search components"]'));
    assert.ok([...f.querySelectorAll("div")].some((d) => d.textContent === "Layout"), "category header");
    assert.ok(f.querySelector('[data-tile="html.heading"]'));
    assert.ok(f.querySelector("[data-flyout-open-tab]"));
    e.select(e.get("h1"));
    assert.equal(e.can("insert.component"), false);
  });

  it("search filters the tiles; picking inserts as the last child of a container and closes the menu (one undo step)", async () => {
    mount();
    await openFlyout();
    await r.type(flyout()!.querySelector("input")!, "heading");
    assert.deepEqual([...flyout()!.querySelectorAll<HTMLElement>("[data-tile]")].map((t) => t.dataset.tile), ["html.heading"]);
    await r.click(flyout()!.querySelector('[data-tile="html.heading"]')!);
    assert.equal(menu(), null);
    assert.match(e.text(), /<p>World<\/p>\s*<h2>Heading<\/h2>\s*<\/section>/, "last child of the section");
    assert.ok(e.undo());
    assert.ok(!e.text().includes("<h2>Heading</h2>"));
  });

  it("'Open components tab' opens the Add panel there and closes the menu", async () => {
    mount();
    await openFlyout();
    await r.click(flyout()!.querySelector("[data-flyout-open-tab]")!);
    assert.equal(menu(), null);
    assert.equal(addPanelOf(e.state).open, true);
    assert.equal(addPanelOf(e.state).tab, "components");
  });

  it("Esc closes layers in order: the flyout, then the Insert submenu, then the menu (the selection stays)", async () => {
    mount();
    await openFlyout();
    assert.ok(flyout() && sub() && menu());
    press("Escape");
    assert.ok(!flyout() && sub() && menu(), "flyout first");
    press("Escape");
    assert.ok(!sub() && menu(), "then the submenu");
    press("Escape");
    assert.equal(menu(), null);
    assert.equal(e.state.selection.handles.length, 1);
  });
});

describe("context menu: rows", () => {
  it("Select parent is hidden when the parent is the document (body), also for a top-level node", async () => {
    mount();
    e.select(e.get("h1"));
    await open();
    assert.ok(item("element.selectParent") && !item("element.selectParent").disabled);
    await act(async () => void e.run("contextMenu.close"));
    e.select(e.get("main"));
    await open();
    assert.equal(document.body.querySelector('[data-command="element.selectParent"]'), null, "main's parent is body: the row is hidden");
    await act(async () => void e.run("contextMenu.close"));
    const top = createTestEditor({ files: { "index.liquid": "<section>\n  <p>x</p>\n</section>\n" }, extensions: [htmlKit(), tailwindKit(), editorKit()] as never });
    r.unmount();
    resetOverlaysForTests();
    e = top;
    r = render(<Editor editor={e} platform="other" />);
    e.select(e.get("section"));
    await open();
    assert.equal(document.body.querySelector('[data-command="element.selectParent"]'), null, "a top-level node: hidden");
  });

  it("Move up / Move down are disabled when there is no room, and a pick leaves the menu open", async () => {
    mount();
    e.select(e.get("h1"));
    await open();
    assert.equal(item("element.moveUp").disabled, true, "first child");
    assert.equal(item("element.moveDown").disabled, false);
    await r.click(item("element.moveDown"));
    assert.ok(menu(), "stays open");
    assert.ok(e.text().indexOf("<p>World</p>") < e.text().indexOf("<h1"), "moved");
    assert.equal(item("element.moveDown").disabled, true, "now the last child");
    assert.equal(item("element.moveUp").disabled, false);
  });

  it("'Include in AI chat' appears only when the host registered an AI command; it runs it with the selection", async () => {
    mount();
    e.select(e.get("h1"));
    await open();
    assert.ok(![...document.body.querySelectorAll("[role=menuitem]")].some((i) => i.textContent === "Include in AI chat"));
    r.unmount();
    resetOverlaysForTests();
    document.body.innerHTML = "";
    const got: string[] = [];
    const ai = defineCommand<{ at?: { tag: string } }>({ id: "host.aiInclude", title: "AI", run: (ctx, a) => (ctx.dispatch && got.push(a?.at?.tag ?? "?"), true) });
    mount([ai, aiChatFacet.of("host.aiInclude")]);
    e.select(e.get("h1"));
    await open();
    const rows = [...document.body.querySelectorAll<HTMLElement>("[role=menuitem]")];
    assert.equal(rows.at(-1)!.textContent, "Include in AI chat", "last, after a divider");
    await r.click(rows.at(-1)!);
    assert.deepEqual(got, ["h1"]);
    assert.equal(menu(), null);
  });

  it("'Convert to component' shows between Duplicate and Delete (the Liquid kit defines component.convert); there is no 'New component' or 'Repeat for each…' row", async () => {
    mount([liquidKit()]);
    e.select(e.get("h1"));
    await open();
    const seq = [...menu()!.querySelectorAll<HTMLElement>("[data-command]")].map((i) => i.dataset.command);
    assert.ok(seq.includes("component.convert"), "the Liquid kit defines component.convert, so the row shows");
    assert.ok(seq.indexOf("element.duplicate") < seq.indexOf("component.convert") && seq.indexOf("component.convert") < seq.indexOf("element.remove"));
    assert.ok(!seq.includes("component.new") && !seq.includes("element.repeatForEach"));
  });

  it("clamps inside the window, closes on an outside press", async () => {
    mount();
    e.select(e.get("h1"));
    await act(async () => void e.run("contextMenu.open", { x: 99999, y: -5 }));
    assert.equal(menu()!.style.top, "8px");
    assert.ok(parseInt(menu()!.style.left) <= window.innerWidth - 8);
    await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    assert.equal(chromeOf(e.state).contextMenu, null);
  });
});

describe("context menu: canvas entry", () => {
  it("double-click on a canvas element does not open the menu (fixed: today it did); right-click does", async () => {
    const { r: cr, doc, e: ce } = await mountCanvas();
    try {
      await fireIn(doc.querySelector("h1")!, "mousedown");
      await fireIn(doc.querySelector("h1")!, "dblclick", { clientX: 10, clientY: 10 });
      assert.equal(chromeOf(ce.state).contextMenu, null);
      await fireIn(doc.querySelector("h1")!, "contextmenu", { clientX: 10, clientY: 10 });
      assert.ok(chromeOf(ce.state).contextMenu);
    } finally {
      cr.unmount();
    }
  });
});
