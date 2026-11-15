import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { defineCommand, setSelection } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { aiChatFacet } from "../src/features/menus/aiChat.ts";
import { dragSessionOf } from "../src/features/dnd/dragSession.ts";
import { handleDragOf } from "../src/features/canvas/handleDrag.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { HEADER, PAGE, canvasEditor, fireIn, mountCanvas } from "./canvasHarness.tsx";
import { actRun } from "./harness.tsx";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  resetOverlaysForTests();
});

const FILES = { "index.liquid": PAGE, "partials/header.liquid": HEADER };

async function selectH1(e = canvasEditor()) {
  const m = await mountCanvas(e);
  cleanup = m.r.unmount;
  await fireIn(m.doc.querySelector("h1")!, "mousedown");
  const action = (cmd: string) => m.r.container.querySelector<HTMLButtonElement>(`[data-name-tag] [data-selection-action="${cmd}"]`);
  const group = () => m.r.container.querySelector("[data-name-tag] [data-selection-actions]");
  return { ...m, action, group };
}

describe("selection toolbar on the name tag", () => {
  it("a single selection shows Move up · Move down · Duplicate · Delete and ⋯, with labels and shortcut tooltips", async () => {
    const { r, action } = await selectH1();
    const ids = r.all("[data-name-tag] [data-selection-action]").map((b) => b.getAttribute("data-selection-action"));
    assert.deepEqual(ids, ["element.moveUp", "element.moveDown", "element.duplicate", "element.remove"]);
    assert.equal(action("element.duplicate")!.getAttribute("aria-label"), "Duplicate");
    assert.match(action("element.duplicate")!.getAttribute("data-tooltip-content")!, /^Duplicate \((⌘D|Ctrl\+D)\)$/);
    assert.equal(action("element.duplicate")!.getAttribute("data-tooltip-place"), "top");
    assert.equal(action("element.duplicate")!.hasAttribute("title"), false);
    assert.ok(r.get("[data-name-tag] [data-selection-more]"));
    assert.equal(r.get("[data-name-chip]").textContent, "Heading", "the chip keeps its name");
  });

  it("disabled follows can: Move up on the first child", async () => {
    const { action } = await selectH1();
    assert.equal(action("element.moveUp")!.disabled, true);
    assert.equal(action("element.moveDown")!.disabled, false);
    assert.equal(action("element.duplicate")!.disabled, false);
  });

  it("each button runs its command as one undo step", async () => {
    const { r, e, action } = await selectH1();
    const before = e.state.files.get("index.liquid");
    await r.click(action("element.duplicate")!);
    assert.equal(e.find("index.liquid", "h1").length, 2);
    await act(async () => void e.undo());
    assert.equal(e.state.files.get("index.liquid"), before);

    await act(async () => void e.select(e.get("h1")));
    await r.click(action("element.moveDown")!);
    assert.notEqual(e.state.files.get("index.liquid"), before);
    assert.ok(e.state.files.get("index.liquid")!.indexOf("<ul") < e.state.files.get("index.liquid")!.indexOf("<h1"), "h1 moved below the list");
    await act(async () => void e.undo());
    assert.equal(e.state.files.get("index.liquid"), before);

    await act(async () => void e.select(e.get("h1")));
    await r.click(action("element.remove")!);
    assert.equal(e.find("index.liquid", "h1").length, 0);
    await act(async () => void e.undo());
    assert.equal(e.state.files.get("index.liquid"), before);
  });

  it("Include in AI chat sits before Delete when the host has an AI command", async () => {
    const got: string[] = [];
    const ai = defineCommand<{ at?: { tag: string } }>({ id: "host.aiInclude", title: "AI", run: (ctx, a) => (ctx.dispatch && got.push(a?.at?.tag ?? "?"), true) });
    const e = createTestEditor({ files: FILES, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), ai, aiChatFacet.of("host.aiInclude")], data: { items: ["a"], show: true } });
    const { r } = await selectH1(e);
    const order = [...r.get("[data-selection-actions]").querySelectorAll("button")].map((b) => b.getAttribute("data-selection-action") ?? (b.hasAttribute("data-node-ai") ? "ai" : "more"));
    assert.deepEqual(order, ["element.moveUp", "element.moveDown", "element.duplicate", "ai", "element.remove", "more"]);
    assert.equal(r.all("[data-name-tag] [data-node-ai]").length, 1, "one AI button on the tag");
    await r.click(r.get("[data-selection-actions] [data-node-ai]"));
    assert.deepEqual(got, ["h1"]);
  });

  it("⋯ opens the right-click menu under the button", async () => {
    const { r, e } = await selectH1();
    await r.click(r.get("[data-selection-more]"));
    assert.ok(chromeOf(e.state).contextMenu);
    const menu = document.body.querySelector('[role="menu"][aria-label="Element actions"]');
    assert.ok(menu, "the context menu is open");
    assert.ok(menu!.querySelector('[data-command="element.duplicate"]'));
  });

  it("hidden with several elements selected, during a drag or a handle drag, and while editing text inline", async () => {
    const { e, group, r } = await selectH1();
    assert.ok(group());
    await act(async () => void e.dispatch((tr) => tr.effect(setSelection, { handles: [e.get("h1"), e.get("img")] })));
    assert.equal(group(), null, "multi-select");
    await act(async () => void e.select(e.get("h1")));
    assert.ok(group());

    await act(async () => void dragSessionOf(e).start({ kind: "existing", handles: [e.get("h1")] }, 0, 0, false));
    assert.equal(group(), null, "a drag");
    await act(async () => void dragSessionOf(e).end(false));
    assert.ok(group());

    await act(async () => void handleDragOf(e).set(true));
    assert.equal(group(), null, "a resize / padding drag");
    await act(async () => void handleDragOf(e).set(false));
    assert.ok(group());

    actRun(e, "richtext.edit");
    assert.equal(r.container.querySelector("[data-selection-actions]"), null, "inline text editing");
    actRun(e, "richtext.exit");
    assert.ok(group());
  });

  it("hidden in preview", async () => {
    const { e, r } = await selectH1();
    actRun(e, "preview.toggle");
    assert.equal(r.container.querySelector("[data-selection-actions]"), null);
  });

  it("hidden in content mode (client): the tag stays", async () => {
    const e = createTestEditor({ files: { "index.liquid": '<main><h1 data-editable="text">Hi</h1><p>x</p></main>' }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit()], role: "client" });
    const { r } = await selectH1(e);
    assert.ok(r.get("[data-name-tag]"), "the tag shows");
    assert.equal(r.container.querySelector("[data-selection-actions]"), null);
  });
});
