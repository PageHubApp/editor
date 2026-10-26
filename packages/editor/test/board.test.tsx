import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "react";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { DEFAULT_COMPONENTS, editorKit } from "../src/index.ts";
import { ComponentsProvider } from "../src/components.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { Board } from "../src/features/board/Board.tsx";
import { Breadcrumb } from "../src/features/canvas/Breadcrumb.tsx";
import { render, type Rendered } from "./harness.tsx";
import { boardKit, boardOf, activePartial, toggleEditorTitle, NEW_COMPONENT } from "../src/features/board/boardState.ts";
import { BOARD_FILE, readBoard, serializeBoard } from "../src/features/board/boardLayout.ts";
import { canvasOf, canvasPage } from "../src/features/canvas/canvasState.ts";

const PAGE = `<main>
  {% render 'header' %}
  <p>Body</p>
</main>
`;
const HEADER = `<header class="p-4"><a href="/">Home</a></header>\n`;

export const boardEditor = (files: Record<string, string> = { "index.liquid": PAGE, "partials/header.liquid": HEADER }) =>
  createTestEditor({ files, extensions: [htmlKit(), liquidKit(), tailwindKit(), editorKit(), boardKit()] });

describe("board commands", () => {
  it("component.toggleEditor: opens / closes the board; label 'Switch to components editor' ↔ 'Switch to page editor'", () => {
    const e = boardEditor();
    assert.equal(toggleEditorTitle(e.state), "Switch to components editor");
    assert.ok(e.run("component.toggleEditor"));
    assert.equal(boardOf(e.state).open, true);
    assert.equal(toggleEditorTitle(e.state), "Switch to page editor");
    assert.ok(e.run("component.toggleEditor"));
    assert.equal(boardOf(e.state).open, false);
    assert.equal(e.diff(), "", "never a document change");
  });

  it("component.new: a new partial with an empty container, its card active and selected; one undo step (exact diff)", () => {
    const e = boardEditor();
    assert.ok(e.run("component.new"));
    assert.equal(
      e.diff(),
      `--- a/partials/component.liquid
+++ b/partials/component.liquid
@@ -0,0 +1 @@
+${NEW_COMPONENT}`,
    );
    assert.equal(boardOf(e.state).open, true);
    assert.equal(activePartial(e.state), "partials/component.liquid");
    assert.equal(e.state.selection.primary?.tag, "div");
    assert.ok(e.run("component.new"));
    assert.ok(e.state.files.has("partials/component-2.liquid"), "next free name");
    assert.ok(e.undo());
    assert.ok(e.undo());
    assert.equal(e.diff(), "");
  });

  it("isolating a partial whose root is a popover opens it (view-only), leaves nested <details> alone, and exit closes it", () => {
    const drawer = `<nav id="mobile_nav" popover class="fixed inset-0 h-dvh overflow-y-auto"><details><summary>Services</summary><a href="/a">A</a></details></nav>\n`;
    const wrapped = `<div class="wrap"><dialog id="d"><p>Hi</p></dialog></div>\n`;
    const e = boardEditor({ "index.liquid": PAGE, "partials/header.liquid": HEADER, "partials/mnav-root.liquid": drawer, "partials/wrapped.liquid": wrapped });
    assert.ok(e.run("component.edit", { path: "partials/mnav-root.liquid" }));
    assert.deepEqual(canvasOf(e.state).openOverlays, ["partials/mnav-root.liquid#0"], "the root popover is shown open");
    assert.deepEqual(canvasOf(e.state).closedDetails, [], "nested details stay on the default (open) preview");
    assert.ok(e.run("canvas.toggleDetails", { src: `partials/mnav-root.liquid#${drawer.indexOf("<details")}` }), "and stay toggleable");
    assert.ok(e.run("component.isolate", { path: null }));
    assert.deepEqual(canvasOf(e.state).openOverlays, [], "leaving isolation closes it again");
    assert.ok(e.run("component.edit", { path: "partials/wrapped.liquid" }));
    assert.equal(canvasOf(e.state).openOverlays.length, 1, "a dialog directly inside the root wrapper opens too");
    assert.ok(e.run("component.edit", { path: "partials/header.liquid" }));
    assert.equal(e.diff(), "", "never a document change");
  });

  it("component.edit isolates a partial on the canvas; component.isolate null returns to the page", () => {
    const e = boardEditor();
    assert.equal(canvasPage(e.state), "index.liquid");
    assert.ok(e.run("component.edit", { path: "partials/header.liquid" }));
    assert.deepEqual([boardOf(e.state).open, boardOf(e.state).isolated], [true, true]);
    assert.equal(canvasPage(e.state), "partials/header.liquid");
    assert.equal(activePartial(e.state), "partials/header.liquid");
    assert.equal(e.can("component.edit", { path: "partials/nope.liquid" }), false);
    assert.ok(e.run("component.isolate", { path: null }));
    assert.equal(boardOf(e.state).isolated, false);
    assert.equal(canvasPage(e.state), "index.liquid");
    assert.ok(e.run("component.edit", { path: "partials/header.liquid" }));
    assert.ok(e.run("component.toggleEditor"), "closing the board ends isolation too");
    assert.equal(canvasPage(e.state), "index.liquid");
    assert.equal(e.diff(), "");
  });

  it("choosing a page while a partial is isolated leaves component editing entirely (board, partial, auto-opened drawer)", () => {
    const drawer = `<nav id="mobile_nav" popover class="fixed inset-0"><a href="/a">A</a></nav>\n`;
    const e = boardEditor({ "index.liquid": PAGE, "partials/header.liquid": HEADER, "partials/mnav-root.liquid": drawer });
    assert.ok(e.run("component.edit", { path: "partials/mnav-root.liquid" }));
    assert.equal(canvasOf(e.state).openOverlays.length, 1);
    assert.ok(e.run("canvas.set", { page: "index.liquid" }));
    assert.deepEqual([boardOf(e.state).open, boardOf(e.state).isolated, boardOf(e.state).returnPage], [false, false, null]);
    assert.equal(activePartial(e.state), null);
    assert.deepEqual(canvasOf(e.state).openOverlays, []);
    assert.equal(canvasPage(e.state), "index.liquid");
    assert.equal(e.diff(), "");
  });

  it("board.view: pan, and zoom clamped to 0.25–10", () => {
    const e = boardEditor();
    assert.ok(e.run("board.view", { zoom: 40 }));
    assert.equal(boardOf(e.state).zoom, 10);
    assert.ok(e.run("board.view", { zoom: 0.01, pan: { x: 5, y: 6 } }));
    assert.deepEqual([boardOf(e.state).zoom, boardOf(e.state).pan], [0.25, { x: 5, y: 6 }]);
  });

  it("board.moveCard writes .editor/board.json (min 200×80), one undo step (exact diff)", () => {
    const e = boardEditor();
    assert.ok(e.run("board.moveCard", { name: "header", x: 10.4, y: 20, w: 120, h: 300 }));
    assert.equal(
      e.diff(),
      `--- a/.editor/board.json
+++ b/.editor/board.json
@@ -0,0 +1,11 @@
+{
+  "cards": {
+    "header": {
+      "x": 10,
+      "y": 20,
+      "w": 200,
+      "h": 300
+    }
+  },
+  "notes": []
+}
`,
    );
    assert.ok(e.run("board.moveCard", { name: "header", x: 50, y: 20 }));
    assert.deepEqual(readBoard(e.state.files).cards.header, { x: 50, y: 20, w: 200, h: 300 }, "size kept");
    assert.equal(e.can("board.moveCard", { name: "missing", x: 0, y: 0 }), false);
    assert.ok(e.undo());
    assert.equal(readBoard(e.state.files).cards.header!.x, 10);
  });

  it("board.arrange row / column: 32px gaps from (0,0), labels into a lane", () => {
    const e = boardEditor({ "index.liquid": PAGE, "partials/header.liquid": HEADER, "partials/footer.liquid": "<footer>f</footer>\n" });
    assert.ok(e.run("board.addNote", { kind: "title", x: 3, y: 4 }));
    assert.ok(e.run("board.arrange", { axis: "row", sizes: { footer: { w: 300, h: 100 } } }));
    const b = readBoard(e.state.files);
    assert.deepEqual(b.cards, { footer: { x: 0, y: 32 }, header: { x: 332, y: 32 } });
    assert.deepEqual([b.notes[0]!.x, b.notes[0]!.y], [0, -56]);
    assert.ok(e.run("board.arrange", { axis: "column", sizes: { footer: { w: 300, h: 100 } } }));
    assert.deepEqual(readBoard(e.state.files).cards, { footer: { x: 0, y: 0 }, header: { x: 0, y: 164 } });
  });

  it("board notes: Add label / Add title, edit text, move, remove; the JSON stays inert", () => {
    const e = boardEditor();
    assert.ok(e.run("board.addNote", { kind: "label", x: 1, y: 2 }));
    assert.deepEqual(readBoard(e.state.files).notes, [{ id: "n1", kind: "label", text: "Label", x: 1, y: 2 }]);
    assert.ok(e.run("board.setNote", { id: "n1", text: "{{ x }} <b>", x: 9 }));
    assert.deepEqual(readBoard(e.state.files).notes[0], { id: "n1", kind: "label", text: "{{ x }} <b>", x: 9, y: 2 });
    assert.ok(!/<|\{\{/.test(e.state.files.get(BOARD_FILE)!));
    assert.equal(serializeBoard(readBoard(e.state.files)), e.state.files.get(BOARD_FILE));
    assert.ok(e.run("board.setNote", { id: "n1", remove: true }));
    assert.deepEqual(readBoard(e.state.files).notes, []);
  });
});

// ── the board view ──────────────────────────────────────────────────────────────

const ptr = (el: EventTarget, type: string, init: PointerEventInit) => act(async () => void el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init })));
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));
/** Until every card frame shows its rendered partial. */
async function cardsRendered(r: Rendered) {
  for (let i = 0; i < 100; i++) {
    if (r.all("[data-board-frame]").every((f) => (f as HTMLIFrameElement).contentDocument?.querySelector("[data-edit-src]"))) return;
    await settle();
  }
  throw new Error("cards never rendered");
}
const wheel = (el: Element, init: WheelEventInit & { ctrlKey?: boolean; metaKey?: boolean }) =>
  act(async () => {
    const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
    for (const k of ["ctrlKey", "metaKey"] as const) Object.defineProperty(ev, k, { value: !!init[k] });
    el.dispatchEvent(ev);
  });

function mountBoard(e: TestEditor): Rendered {
  return render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>
        <Breadcrumb />
        <Board />
      </ComponentsProvider>
    </EditorStoreProvider>,
  );
}

const openBoard = async (files?: Record<string, string>) => {
  const e = boardEditor(files);
  e.run("component.toggleEditor");
  const r = mountBoard(e);
  await cardsRendered(r);
  return { e, r };
};

describe("board view", () => {
  it("pan: Space+drag and middle-button drag pan; the wheel pans; Ctrl/Cmd+wheel zooms ×(1−deltaY·0.005)", async () => {
    const { e, r } = await openBoard();
    const s = r.get("[data-board-surface]");
    const start = boardOf(e.state).pan;
    await ptr(s, "pointerdown", { button: 1, clientX: 0, clientY: 0 });
    await ptr(window, "pointermove", { buttons: 4, clientX: 30, clientY: 10 });
    await ptr(window, "pointerup", { clientX: 30, clientY: 10 });
    assert.deepEqual(boardOf(e.state).pan, { x: start.x + 30, y: start.y + 10 });
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })));
    assert.equal(s.style.cursor, "grab");
    await ptr(s, "pointerdown", { button: 0, clientX: 0, clientY: 0 });
    await ptr(window, "pointermove", { buttons: 1, clientX: -10, clientY: 0 });
    await ptr(window, "pointerup", {});
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true })));
    assert.equal(boardOf(e.state).pan.x, start.x + 20);
    await wheel(s, { deltaX: 5, deltaY: 7 });
    assert.deepEqual(boardOf(e.state).pan, { x: start.x + 15, y: start.y + 3 });
    await wheel(s, { deltaY: -100, ctrlKey: true });
    assert.equal(boardOf(e.state).zoom, 1.5);
    await wheel(s, { deltaY: 1000, metaKey: true });
    assert.equal(boardOf(e.state).zoom, 0.25, "clamped");
    r.unmount();
  });

  it("cards: each partial renders on a card; a click inside selects that element; grip drag moves (board.moveCard on release); resize right / bottom / corner (min 200×80)", async () => {
    const { e, r } = await openBoard();
    const card = r.get('[data-board-card="header"]');
    assert.equal(card.querySelector("[data-board-grip]")!.getAttribute("data-tooltip-content"), "Drag to move · Double-click to isolate");
    const doc = r.get('[data-board-frame="header"]') as HTMLIFrameElement;
    const a = doc.contentDocument!.querySelector("a")!;
    await act(async () => void a.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    assert.equal(e.state.selection.primary?.tag, "a");
    assert.equal(activePartial(e.state), "partials/header.liquid");
    await ptr(card.querySelector("[data-board-grip]")!, "pointerdown", { button: 0, clientX: 0, clientY: 0 });
    await ptr(window, "pointermove", { buttons: 1, clientX: 50, clientY: 20 });
    assert.equal(readBoard(e.state.files).cards.header, undefined, "nothing written mid-drag");
    await ptr(window, "pointerup", { clientX: 50, clientY: 20 });
    assert.deepEqual(readBoard(e.state.files).cards.header, { x: 50, y: 52 });
    await ptr(card.querySelector('[data-board-resize="corner"]')!, "pointerdown", { button: 0, clientX: 0, clientY: 0 });
    await ptr(window, "pointermove", { buttons: 1, clientX: -400, clientY: -400 });
    await ptr(window, "pointerup", {});
    assert.deepEqual(readBoard(e.state.files).cards.header, { x: 50, y: 52, w: 200, h: 80 });
    assert.ok(e.undo());
    assert.deepEqual(readBoard(e.state.files).cards.header, { x: 50, y: 52 }, "each gesture is one undo step");
    r.unmount();
  });

  it("isolated: the canvas slot sits in a flex column so the frame fills the pane (not the 150px iframe default)", async () => {
    const { e, r } = await openBoard();
    await r.click(r.get("[data-board-isolate]"));
    assert.equal(boardOf(e.state).isolated, true);
    const wrap = r.get("[data-board-isolated]");
    assert.match(wrap.className, /\bflex\b/);
    assert.match(wrap.className, /flex-col/);
    r.unmount();
  });

  it("double-click the grip or the focus icon isolates: the canvas shows the partial, 'Exit isolation' pill returns", async () => {
    const { e, r } = await openBoard();
    await r.fire(r.get("[data-board-grip]"), "dblclick");
    assert.equal(boardOf(e.state).isolated, true);
    assert.equal(canvasPage(e.state), "partials/header.liquid");
    const pill = r.get("[data-board-exit]");
    assert.equal(pill.getAttribute("data-tooltip-content"), "Exit isolation");
    assert.match(pill.textContent!, /header/);
    await r.click(pill);
    assert.equal(boardOf(e.state).isolated, false);
    assert.equal(canvasPage(e.state), "index.liquid");
    await settle();
    await r.click(r.get("[data-board-isolate]"));
    assert.equal(boardOf(e.state).isolated, true);
    r.unmount();
  });

  it("toolbar: count, New component, Arrange row / column (32px gap), Add label, Add title, zoom; empty board text", async () => {
    const { e, r } = await openBoard({ "index.liquid": "<main></main>\n" });
    assert.match(r.get("[data-board-empty]").textContent!, /No components yet/);
    assert.match(r.get("[data-board-toolbar]").textContent!, /0 components/);
    await r.click(r.get('[data-board-tool="new"]'));
    await settle();
    assert.match(r.get("[data-board-toolbar]").textContent!, /^1 component(?!s)/);
    await r.click(r.get('[data-board-tool="new"]'));
    await settle();
    await r.click(r.get('[data-board-tool="row"]'));
    const cards = readBoard(e.state.files).cards;
    assert.equal(cards["component-2"]!.x - cards.component!.x, 480 + 32);
    await r.click(r.get('[data-board-tool="column"]'));
    assert.equal(readBoard(e.state.files).cards.component!.x, 0);
    await r.click(r.get('[data-board-tool="label"]'));
    await r.click(r.get('[data-board-tool="title"]'));
    assert.deepEqual(readBoard(e.state.files).notes.map((n) => [n.kind, n.text]), [["label", "Label"], ["title", "Group title"]]);
    assert.equal(r.all("[data-board-note]").length, 2);
    await r.click(r.get('[data-board-tool="zoom-in"]'));
    assert.equal(boardOf(e.state).zoom, 1.1);
    await r.click(r.get('[data-board-tool="zoom-out"]'));
    await r.click(r.get('[data-board-tool="zoom-out"]'));
    assert.equal(r.get("[data-board-zoom]").textContent, "90%");
    await r.click(r.get("[data-board-zoom]"));
    assert.equal(boardOf(e.state).zoom, 1);
    r.unmount();
  });

  it("notes: double-click edits the text (Enter saves), drag moves, × removes", async () => {
    const { e, r } = await openBoard();
    e.run("board.addNote", { kind: "label", x: 0, y: 0 });
    await settle();
    await r.fire(r.get("[data-board-note]"), "dblclick");
    const input = r.get("[data-board-note-input]") as HTMLInputElement;
    input.value = "Nav";
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(readBoard(e.state.files).notes[0]!.text, "Nav");
    await ptr(r.get("[data-board-note]"), "pointerdown", { button: 0, clientX: 0, clientY: 0 });
    await ptr(window, "pointermove", { buttons: 1, clientX: 20, clientY: 10 });
    await ptr(window, "pointerup", {});
    assert.deepEqual([readBoard(e.state.files).notes[0]!.x, readBoard(e.state.files).notes[0]!.y], [20, 10]);
    await r.click(r.get("[data-board-note-remove]"));
    assert.equal(readBoard(e.state.files).notes.length, 0);
    r.unmount();
  });

  it("component mode: ComponentSelector replaces the breadcrumb row; picking a component isolates it", async () => {
    const { e, r } = await openBoard();
    const sel = r.get("[data-component-selector]");
    assert.ok(sel.closest('[data-slot="Breadcrumb"]'));
    assert.equal(r.container.querySelector("[data-crumb-current]"), null);
    assert.match(sel.textContent!, /Components/);
    await r.click(r.get('[aria-label="Component selector"]'));
    const rows = r.all('[role="option"]').map((o) => o.textContent);
    assert.deepEqual(rows, ["Create component", "headerComponent"], "Create component first; rows: name + 'Component'");
    await r.fire(r.all('[role="option"]')[1]!, "mousedown");
    assert.equal(boardOf(e.state).isolated, true);
    assert.match(r.get("[data-component-selector]").textContent!, /header/);
    act(() => void e.run("component.toggleEditor"));
    assert.equal(r.container.querySelector("[data-component-selector]"), null, "page mode: the node breadcrumb again");
    r.unmount();
  });
});
