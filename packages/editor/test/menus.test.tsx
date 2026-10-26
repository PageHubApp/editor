import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { Editor } from "../src/index.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { fixtureEditor, render, type Rendered } from "./harness.tsx";
import { press } from "./keys.ts";

let e: ReturnType<typeof fixtureEditor>;
let r: Rendered;
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Element actions"]');
const items = () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
const item = (command: string) => document.body.querySelector<HTMLButtonElement>(`[data-command="${command}"]`)!;
const openAt = (x = 40, y = 50) => act(() => void e.run("contextMenu.open", { x, y }));

beforeEach(() => {
  e = fixtureEditor();
  r = render(<Editor editor={e} platform="other" />);
});
afterEach(() => {
  r.unmount();
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

describe("context menu", () => {
  it("opens at the pointer as a fixed menu with the canvas/context rows that apply, in group order (no Paste with nothing copied, no Select parent under the body)", async () => {
    assert.equal(menu(), null);
    await openAt(120, 80);
    const m = menu()!;
    assert.equal(m.style.left, "120px");
    assert.equal(m.style.top, "80px");
    assert.ok(m.className.includes("fixed") && m.className.includes("min-w-[12rem]") && m.className.includes("rounded-xl"));
    assert.deepEqual(items().map((i) => i.dataset.command ?? `${i.dataset.submenuTrigger}▸`), ["selection.clear", "element.copy", "classes.copy", "element.moveUp", "element.moveDown", "insert▸", "element.duplicate", "element.remove"]);
    assert.equal(m.querySelectorAll(".border-t").length, 4, "dividers between the groups");
  });

  it("stays 8px inside the window", async () => {
    await openAt(-30, 99999);
    assert.equal(menu()!.style.left, "8px");
    assert.ok(parseInt(menu()!.style.top) < window.innerHeight);
  });

  it("titles and shortcuts come from the commands and their bindings", async () => {
    await openAt();
    assert.match(item("element.copy").textContent!, /Copy/);
    assert.match(item("element.copy").textContent!, /Ctrl\+C/);
    assert.match(item("element.remove").textContent!, /Delete/);
    assert.match(item("element.duplicate").textContent!, /Ctrl\+D/);
  });

  it("a row whose command can't run is disabled", async () => {
    e.select(e.get("section"));
    await openAt();
    assert.equal(item("element.moveUp").disabled, true, "the only top-level node has no room to move");
    assert.equal(item("element.copy").disabled, false);
    assert.equal(item("selection.clear").disabled, false);
  });

  it("a pick runs the command and closes the menu", async () => {
    e.select(e.get("h1"));
    await openAt();
    await r.click(item("element.duplicate"));
    assert.equal(menu(), null);
    assert.equal(e.find("index.liquid", "h1").length, 2);
  });

  it("Deselect clears the selection; Delete removes the node", async () => {
    e.select(e.get("p"));
    await openAt();
    await r.click(item("element.remove"));
    assert.ok(!e.text().includes("World"));
    await openAt();
    await r.click(item("selection.clear"));
    assert.equal(e.state.selection.handles.length, 0);
  });

  it("closes on Escape (selection kept) and on an outside pointer-down, not on a right-click", async () => {
    await openAt();
    assert.equal(press("Escape"), true);
    assert.equal(menu(), null);
    assert.equal(e.state.selection.handles.length, 1);
    await openAt();
    await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 })));
    assert.ok(menu(), "right button does not dismiss");
    await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    assert.equal(menu(), null);
    assert.equal(chromeOf(e.state).contextMenu, null);
  });

  it("a press inside the canvas iframe (it never reaches the host document) closes the menu too", async () => {
    await act(async () => void (await new Promise((res) => setTimeout(res, 100))));
    const doc = document.querySelector("iframe")?.contentDocument;
    assert.ok(doc?.body, "the canvas frame has a document");
    await openAt();
    assert.ok(menu());
    await act(async () => void doc!.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 })));
    assert.ok(menu(), "right button does not dismiss");
    await act(async () => void doc!.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    assert.equal(menu(), null);
  });

  it("opening the palette closes the context menu", async () => {
    await openAt();
    press("ctrl+k");
    assert.equal(chromeOf(e.state).contextMenu, null);
  });
});
