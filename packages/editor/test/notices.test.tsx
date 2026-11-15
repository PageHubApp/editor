import "./setup.ts";
import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { blockSourceFacet, type BlockItem, type BlockSource } from "@pagehub/engine/host";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { AddPanel } from "../src/features/add/AddPanel.tsx";
import { NoticeHost } from "../src/features/notices/NoticeHost.tsx";
import { NOTICE_MS, noticeOf, showNotice } from "../src/features/notices/noticeState.ts";
import { actRun, render, withEditor, type Rendered } from "./harness.tsx";

const PAGE = `<main>\n  <section>One</section>\n  <p>B</p>\n</main>\n`;
const BLOCKS: BlockItem[] = [{ slug: "faq-one", name: "FAQ one", category: "faq", source: `<section>faq</section>` }];

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  mock.timers.reset();
  localStorage.clear();
});

function editor(source: Partial<BlockSource> = {}): TestEditor {
  return createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), blockSourceFacet.of({ blocks: () => BLOCKS, ...source })] });
}

function mount(e: TestEditor, panel = false): Rendered {
  const r = render(withEditor(e, <>{panel && <AddPanel />}<NoticeHost /></>));
  open.push(r);
  return r;
}

const message = (r: Rendered) => r.all("[data-notice-message]")[0]?.textContent ?? null;
const actions = (r: Rendered) => r.all("[data-notice-action]").map((b) => b.textContent);
const tick = (ms: number) => act(() => void mock.timers.tick(ms));

describe("notices: the primitive", () => {
  it("shows one notice at a time in an always-mounted status region; at most two actions; an action runs and closes it", async () => {
    const e = editor();
    const r = mount(e);
    assert.equal(r.get("[data-notice-region]").getAttribute("role"), "status");
    assert.equal(message(r), null);
    const ran: string[] = [];
    act(() => void showNotice(e, { message: "First" }));
    act(() => void showNotice(e, { message: "Saved", actions: [{ label: "A", run: () => ran.push("a") }, { label: "B", run: () => ran.push("b") }, { label: "C", run: () => ran.push("c") }] }));
    assert.equal(r.all("[data-notice]").length, 1);
    assert.equal(message(r), "Saved");
    assert.deepEqual(actions(r), ["A", "B"]);
    await r.click(r.get('[data-notice-action="B"]'));
    assert.deepEqual(ran, ["b"]);
    assert.equal(noticeOf(e.state), null);
    assert.equal(message(r), null);
  });

  it("hides after NOTICE_MS; hovering pauses the countdown and leaving resumes it; Dismiss closes it", async () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const e = editor();
    const r = mount(e);
    act(() => void showNotice(e, { message: "Hello" }));
    await tick(NOTICE_MS - 100);
    assert.equal(message(r), "Hello");
    await tick(200);
    assert.equal(message(r), null, "auto-hidden");

    act(() => void showNotice(e, { message: "Held" }));
    await tick(NOTICE_MS - 1000);
    await r.fire(r.get("[data-notice]"), "mouseover");
    await tick(NOTICE_MS * 2);
    assert.equal(message(r), "Held", "paused while hovered");
    await r.fire(r.get("[data-notice]"), "mouseout");
    await tick(900);
    assert.equal(message(r), "Held", "resumes with the time that was left");
    await tick(200);
    assert.equal(message(r), null);

    act(() => void showNotice(e, { message: "Bye" }));
    await r.click(r.get("[data-notice-close]"));
    assert.equal(message(r), null);
  });

  it("a later edit clears it, so Undo always undoes the step it announced", () => {
    const e = editor();
    const r = mount(e);
    act(() => void showNotice(e, { message: "Hi" }));
    e.select(e.get("p"));
    actRun(e, "element.remove");
    assert.equal(message(r), null);
  });

  it("the save's own stamping and the stored copy coming back reformatted keep it", () => {
    const e = editor();
    const r = mount(e);
    act(() => void showNotice(e, { message: "Hi" }));
    const p = e.get("p");
    act(() => void e.dispatch((tr) => tr.setAttr(p, "data-edit-id", "abc").annotate({ origin: "plugin", system: true, history: false })));
    act(() => void e.dispatch((tr) => tr.setAttr(e.get("p"), "class", "x").annotate({ origin: "remote", history: false })));
    assert.equal(message(r), "Hi");
  });
});

describe("notices: insert and delete", () => {
  it("double-click a block: it is added and selected, 'Added <name>' with Undo and Show; Undo removes it", async () => {
    const e = editor();
    actRun(e, "insert.open", { tab: "blocks", category: "faq" });
    const r = mount(e, true);
    await act(async () => {});
    await r.fire(r.get('[data-block-card="faq-one"]'), "dblclick");
    await act(async () => {});
    assert.match(e.text(), /<section>faq<\/section>/);
    const added = e.state.selection.primary;
    assert.equal(added?.tag, "section");
    assert.equal(message(r), "Added FAQ one", "named by the block that was picked");
    assert.deepEqual(actions(r), ["Undo", "Show"]);
    await r.click(r.get('[data-notice-action="Undo"]'));
    assert.equal(e.text(), PAGE);
    assert.equal(message(r), null);
  });

  it("Show selects the added element again", async () => {
    const e = editor();
    actRun(e, "insert.open", { tab: "blocks", category: "faq" });
    const r = mount(e, true);
    await act(async () => {});
    await r.fire(r.get('[data-block-card="faq-one"]'), "dblclick");
    await act(async () => {});
    const added = e.state.selection.primary!;
    const show = noticeOf(e.state)!.actions.find((a) => a.label === "Show")!;
    e.select(e.get("p"));
    act(() => show.run(e));
    assert.equal(e.state.selection.primary, added);
  });

  it("a failed insert says it couldn't be added and why", async () => {
    const e = editor({ blocks: () => [{ slug: "a", name: "Hero", category: "faq" }], detail: async () => Promise.reject(new Error("nope")) });
    actRun(e, "insert.open", { tab: "blocks", category: "faq" });
    const r = mount(e, true);
    await act(async () => {});
    await act(async () => void r.get('[data-block-card="a"]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await act(async () => {});
    assert.equal(e.text(), PAGE);
    assert.equal(message(r), "Couldn't add Hero. It didn't load. Try again.");
    assert.equal(r.get("[data-notice]").getAttribute("data-notice"), "error");
  });

  it("deleting a section: 'Section deleted' with Undo, which brings it back; deleting anything else shows nothing", async () => {
    const e = editor();
    const r = mount(e);
    e.select(e.get("p"));
    actRun(e, "element.remove");
    assert.equal(message(r), null);
    e.select(e.get("section"));
    actRun(e, "element.remove");
    assert.equal(message(r), "Section deleted");
    assert.deepEqual(actions(r), ["Undo"]);
    await r.click(r.get('[data-notice-action="Undo"]'));
    assert.match(e.text(), /<section>One<\/section>/);
    assert.equal(message(r), null);
  });
});
