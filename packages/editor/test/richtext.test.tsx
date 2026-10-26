import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { isTextSurface } from "../src/features/keyboard/domKeymap.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { drawsPseudoContent, RichTextLayer } from "../src/features/richtext/RichTextLayer.tsx";
import { richTextKit, richTextOf } from "../src/features/richtext/richTextState.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, setRect, wait } from "./canvasHarness.tsx";
import { press } from "./keys.ts";

const P = "index.liquid";
const PAGE = `<main class="p-4">
  <h1 class="text-xl">Hello <a href="/old">old link</a></h1>
  <p class="empty"></p>
  <div class="box"><p>Inner</p></div>
  {% render 'card' %}
</main>
`;
const CARD = `<div class="card"><p>Card text</p></div>\n`;

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
});

function editor(): TestEditor {
  return createTestEditor({ files: { [P]: PAGE, "partials/card.liquid": CARD }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit()] });
}

async function mount(e = editor()) {
  const r = render(<Editor editor={e} components={{ InlineTextToolbar: RichTextLayer }} />);
  mounted = r;
  const doc = await rendered(r);
  return { r, e, doc };
}

const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
/** A ⌘ / Ctrl shortcut on the edited text. */
const mod = (key: string, el: Element, shift = false) => press(`${mac ? "meta" : "ctrl"}${shift ? "+shift" : ""}+${key}`, el);

/** Select the h1 and click it again: edit mode. */
async function editH1(doc: Document) {
  const h1 = doc.querySelector("h1")!;
  await fireIn(h1, "mousedown");
  await fireIn(h1, "mouseup", { clientX: 50 });
  await fireIn(h1, "mousedown");
  await wait(5);
  return doc.querySelector("h1")!;
}

const sessionEditor = (doc: Document) => (doc.querySelector("[data-rt-editing]") as unknown as { editor: import("@tiptap/core").Editor }).editor;

test("txt: a click on the already-selected text enters edit mode (no deselect); TipTap is the element itself, caret at the end", async () => {
  const { e, doc } = await mount();
  const h1 = await editH1(doc);
  assert.equal(richTextOf(e.state).editing, e.get("h1"));
  assert.equal(e.state.selection.primary, e.get("h1"), "the second click did not deselect");
  assert.equal(h1.getAttribute("contenteditable"), "true");
  assert.ok(isTextSurface(h1), "keys inside count as text editing");
  const ed = sessionEditor(doc);
  assert.equal(ed.state.selection.from, ed.state.doc.content.size);
});

test("txt / keys: Enter or Space on a selected text leaf enters edit mode; not on a block", async () => {
  const { e } = await mount();
  e.select(e.get("h1"));
  assert.equal(e.press("Enter").command, "richtext.edit");
  e.run("richtext.exit");
  assert.ok(e.run("richtext.edit") && e.run("richtext.exit"));
  e.select(e.get("h1"));
  assert.equal(e.press("space").command, "richtext.edit");
  e.select(e.get("div.box"));
  assert.ok(!e.run("richtext.edit"));
});

test("keys: Enter on a non-text element selects its first child; Enter on text still edits; the panel keeps its Enter", async () => {
  const { e } = await mount();
  e.select(e.get("div.box"));
  const first = e.get("div.box").children()[0];
  assert.equal(e.press("Enter").command, "element.selectChild");
  assert.equal(e.state.selection.primary, first);
  e.select(e.get("div.box"));
  assert.equal(e.press("Enter", { ui: { focus: "panel" } }).handled, false, "a focused panel button keeps Enter");
  e.select(e.get("h1"));
  assert.equal(e.press("Enter").command, "richtext.edit");
});

test("txt: text inside an include (a linked component) is never editable from the page", async () => {
  const { e, doc } = await mount();
  const p = doc.querySelector(".card p")!;
  await fireIn(p, "mousedown");
  await fireIn(p, "mouseup", { clientX: 50 });
  assert.notEqual(e.state.selection.primary?.kind, "element", "the click selects the include tag");
  await fireIn(doc.querySelector(".card p")!, "mousedown");
  assert.equal(richTextOf(e.state).editing, null);
  assert.ok(!e.run("richtext.edit"));
});

test("undo step (fix): typing 10 characters is one undo step; one undo restores the original source exactly", async () => {
  const { e, doc } = await mount();
  await editH1(doc);
  const ed = sessionEditor(doc);
  await act(async () => {
    for (const ch of "0123456789") ed.commands.insertContent(ch);
  });
  assert.equal(e.text(), PAGE, "one commit per group, not per keystroke");
  await act(async () => void e.select(e.get("main"))); // selecting elsewhere ends editing and commits
  assert.match(e.text(), /<h1 class="text-xl">Hello <a href="\/old">old link<\/a>0123456789<\/h1>/);
  assert.equal(richTextOf(e.state).editing, null);
  assert.ok(e.undo());
  assert.equal(e.text(), PAGE);
});

test("txt: pausing 500 ms commits the group; the canvas skips its rewrite while editing, so the session and caret stay put", async () => {
  const { e, r, doc } = await mount();
  await editH1(doc);
  const before = r.container.querySelector("[data-canvas-frame]")!.getAttribute("data-render-version");
  await act(async () => void sessionEditor(doc).commands.insertContent("!"));
  await wait(560);
  assert.match(e.text(), /old link<\/a>!<\/h1>/);
  assert.equal(r.container.querySelector("[data-canvas-frame]")!.getAttribute("data-render-version"), before, "no rewrite during text editing");
  const h1 = doc.querySelector("h1")!;
  assert.ok(h1.hasAttribute("data-rt-editing"));
  assert.equal(sessionEditor(doc).state.selection.from, sessionEditor(doc).state.doc.content.size);
});

test("keys: mod+B / mod+I / mod+U inside text editing toggle bold / italic / underline", async () => {
  const { e, doc } = await mount();
  const h1 = await editH1(doc);
  const ed = sessionEditor(doc);
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  mod("b", h1);
  mod("i", h1);
  mod("u", h1);
  assert.ok(ed.isActive("bold") && ed.isActive("italic") && ed.isActive("underline"));
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<h1 class="text-xl"><strong><em><u>Hello<\/u><\/em><\/strong> <a/);
});

test("txt: main toolbar row only with a non-empty selection: Bold, Italic, Underline, Font, Link (tinted in a link), colours, More", async () => {
  const { r, doc } = await mount();
  await editH1(doc);
  const ed = sessionEditor(doc);
  assert.ok(r.container.querySelector("[data-rt-toolbar]"));
  assert.equal(r.container.querySelector("[data-rt-toolbar-row]"), null, "collapsed caret: no row");
  act(() => void ed.commands.setTextSelection({ from: 7, to: 9 })); // inside the link
  const labels = r.all("[data-rt-toolbar-row] button").map((b) => b.getAttribute("aria-label"));
  assert.deepEqual(labels, ["Bold (⌘B)", "Italic (⌘I)", "Underline (⌘U)", "Font", "Insert Link (⌘K)", "Text color (inherited)", "Highlight (none)", "More"]);
  assert.match(r.get('[aria-label="Insert Link (⌘K)"]').className, /text-primary/, "tinted inside a link");
  assert.equal(r.get('[aria-label="Bold (⌘B)"]').getAttribute("data-tooltip-content"), "Bold (⌘B)");
  assert.equal(r.get('[aria-label="Bold (⌘B)"]').hasAttribute("title"), false);
});

test("keys / txt: mod+K opens the Link panel (selecting the whole link); a click on a link does too; Update and Remove", async () => {
  const { e, r, doc } = await mount();
  const h1 = await editH1(doc);
  const ed = sessionEditor(doc);
  act(() => void ed.commands.setTextSelection(8));
  mod("k", h1);
  assert.equal(richTextOf(e.state).panel, "link");
  assert.deepEqual([ed.state.selection.from, ed.state.selection.to], [6, 14], "the whole link is selected");
  await r.click(r.all('[data-rt-panel="link"] button').find((b) => b.textContent === "URL")!);
  await r.type(r.get('input[aria-label="URL"]'), "https://example.com");
  await r.click(r.all('[data-rt-panel="link"] button').find((b) => b.textContent === "Update")!);
  assert.equal(richTextOf(e.state).panel, null);
  assert.equal(ed.getAttributes("link").href, "https://example.com");
  act(() => void ed.commands.setTextSelection(3));
  act(() => void ed.view.someProp("handleClick", (f) => f(ed.view, 8, new MouseEvent("click"))));
  assert.equal(richTextOf(e.state).panel, "link", "click on a link opens the panel");
  await r.click(r.all('[data-rt-panel="link"] button').find((b) => b.textContent === "Remove")!);
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<h1 class="text-xl">Hello old link<\/h1>/);
});

test("txt: Link panel with no selection inserts the link text; Page is the default tab listing the site's pages", async () => {
  const { e, r, doc } = await mount();
  const h1 = await editH1(doc);
  mod("k", h1);
  const options = r.all('[data-rt-panel="link"] [role="option"]').map((o) => o.textContent);
  assert.deepEqual(options, ["/"]);
  await r.click(r.all('[data-rt-panel="link"] button').find((b) => b.textContent === "Insert")!);
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /old link<\/a><a href="\/">\/<\/a><\/h1>/);
});

test("txt: panel dismissal — Esc, outside mousedown, the same button again, and a collapsing selection close it", async () => {
  const { e, r, doc } = await mount();
  const h1 = await editH1(doc);
  const ed = sessionEditor(doc);
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="More"]'));
  assert.equal(richTextOf(e.state).panel, "more");
  press("Escape"); // host keymap → overlay stack
  assert.equal(richTextOf(e.state).panel, null);
  await r.click(r.get('[aria-label="Text color (inherited)"]'));
  await r.click(r.get('[aria-label="Text color (inherited)"]'));
  assert.equal(richTextOf(e.state).panel, null, "same button toggles it closed");
  await r.click(r.get('[aria-label="Font"]'));
  await r.fire(document.body, "mousedown");
  assert.equal(richTextOf(e.state).panel, null, "outside mousedown");
  await r.click(r.get('[aria-label="Highlight (none)"]'));
  act(() => void ed.commands.setTextSelection(2));
  await wait(1);
  assert.equal(richTextOf(e.state).panel, null, "selection collapsed");
  mod("k", h1);
  press("Escape", h1); // Esc inside the text closes the panel first …
  assert.equal(richTextOf(e.state).panel, null);
  press("Escape", h1); // … then ends editing
  assert.equal(richTextOf(e.state).editing, null);
});

test("txt: colour panels write a theme-token span; Clear unsets and closes", async () => {
  const { e, r, doc } = await mount();
  await editH1(doc);
  const ed = sessionEditor(doc);
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="Text color (inherited)"]'));
  await r.click(r.get('[aria-label="text-primary"]'));
  await r.click(r.get('[aria-label="Text color"]')); // reopen after the toggle
  await r.click(r.get('[aria-label="Highlight (none)"]'));
  await r.click(r.get('[aria-label="bg-accent"]'));
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<span class="text-primary"><span class="bg-accent">Hello<\/span><\/span>|<span class="bg-accent"><span class="text-primary">Hello/);
  e.undo();
  e.select(e.get("h1"));
  await act(async () => void e.run("richtext.edit"));
  const ed2 = sessionEditor(doc);
  act(() => void ed2.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="Highlight (none)"]'));
  await r.click(r.all('[data-rt-panel="highlight"] button').at(-1)!);
  assert.equal(richTextOf(e.state).panel, null, "Clear closes");
});

test("txt: More panel — strike / superscript / subscript, clear formatting, insert output, delete the element", async () => {
  const { e, r, doc } = await mount();
  await editH1(doc);
  const ed = sessionEditor(doc);
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="More"]'));
  await r.click(r.get('[aria-label="Strikethrough"]'));
  await r.click(r.get('[aria-label="Superscript"]'));
  await r.click(r.get('[aria-label="Subscript"]'));
  assert.ok(ed.isActive("strike") && ed.isActive("subscript") && !ed.isActive("superscript"), "sub excludes sup");
  await r.click(r.get('[aria-label="Clear formatting"]'));
  assert.ok(!ed.isActive("strike"));
  await r.type(r.get('input[aria-label="Insert output"]'), "shop.name");
  await act(async () => void r.get('input[aria-label="Insert output"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<h1 class="text-xl">{{ shop.name }} <a href="\/old">/);
  e.select(e.get("h1"));
  await act(async () => void e.run("richtext.edit"));
  act(() => void sessionEditor(doc).commands.selectAll());
  await r.click(r.get('[aria-label="More"]'));
  await r.click(r.get('[data-rt-panel="more"] [aria-label="Delete"]'));
  assert.equal(e.find(P, "h1").length, 0);
});

test("txt: Font panel — text level switches the tag (one step), sizes S/M/L/XL wrap the selection", async () => {
  const { e, r, doc } = await mount();
  await editH1(doc);
  const ed = sessionEditor(doc);
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="Font"]'));
  await r.click(r.all('[data-rt-panel="font"] [aria-label="Size"] button').find((b) => b.textContent === "XL")!);
  await r.click(r.all('[data-rt-panel="font"] [aria-label="Text level"] button').find((b) => b.textContent === "H2")!);
  assert.match(e.text(), /<h2 class="text-xl"><span class="text-2xl">Hello<\/span> <a href="\/old">old link<\/a><\/h2>/);
});

test("txt: empty text shows the dashed hint; while editing an empty leaf is a dashed box", async () => {
  const { e, doc } = await mount();
  const p = doc.querySelector("p.empty")!;
  assert.ok(p.hasAttribute("data-rt-empty"));
  assert.ok(doc.getElementById("ph-richtext-css")?.textContent?.includes('content:"Empty text"'));
  e.select(e.get("p.empty"));
  await act(async () => void e.run("richtext.edit"));
  await wait(5);
  const live = doc.querySelector("p.empty")!;
  assert.ok(live.hasAttribute("data-rt-blank"));
  assert.ok(!live.hasAttribute("data-rt-empty"));
});

test("txt: an empty inline spacer inside a heading with words gets no hint; an empty paragraph still does", async () => {
  const page = `<main class="p-4">\n  <h2 class="t">Navigate <span class="gap"> <span class="inner"></span> </span> claims</h2>\n  <p class="empty"></p>\n</main>\n`;
  const e = createTestEditor({ files: { [P]: page }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit()] });
  const { doc } = await mount(e);
  await wait(5);
  assert.ok(!doc.querySelector("span.inner")!.hasAttribute("data-rt-empty"));
  assert.ok(doc.querySelector("p.empty")!.hasAttribute("data-rt-empty"));
});

test("txt: an icon-font glyph (content drawn by ::before / ::after) is not an empty field", () => {
  // happy-dom computes no pseudo-element styles, so the view is stubbed with what a browser answers.
  const fake = (before: string, after = "none") =>
    ({
      ownerDocument: {
        defaultView: { getComputedStyle: (_el: unknown, pseudo?: string) => ({ content: pseudo === "::before" ? before : pseudo === "::after" ? after : "normal" }) },
      },
    }) as unknown as HTMLElement;
  assert.equal(drawsPseudoContent(fake('"\\f099"')), true, "an icon glyph");
  assert.equal(drawsPseudoContent(fake("none", '"→"')), true, "an ::after arrow");
  assert.equal(drawsPseudoContent(fake("none")), false, "nothing drawn");
  assert.equal(drawsPseudoContent(fake('""')), false, "an empty string draws nothing");
});

test("txt: toolbar sits centred 8px below the element; flips above when it would leave the canvas", async () => {
  const { r, doc } = await mount();
  const h1 = await editH1(doc);
  const host = r.get("[data-canvas-host]");
  setRect(host, { left: 0, top: 0, width: 800, height: 600 });
  Object.defineProperty(host, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 800, height: 600 });
  setRect(h1, { left: 100, top: 100, width: 200, height: 40 });
  act(() => void sessionEditor(doc).commands.selectAll());
  const bar = r.get("[data-rt-toolbar]");
  assert.equal(bar.style.top, "148px");
  assert.equal(bar.style.left, "200px");
  assert.equal(bar.style.transform, "translateX(-50%)");
  setRect(h1, { left: 100, top: 560, width: 200, height: 30 });
  act(() => void sessionEditor(doc).commands.setTextSelection(1));
  assert.equal(bar.style.top, "552px");
  assert.equal(bar.style.transform, "translate(-50%, -100%)");
});

test("undo / txt: mod+Z inside the text commits the typing group and undoes it (one history); host shortcuts don't see text keys", async () => {
  const { e, doc } = await mount();
  const h1 = await editH1(doc);
  await act(async () => {
    for (const ch of "abc") sessionEditor(doc).commands.insertContent(ch);
  });
  mod("z", h1);
  assert.equal(e.text(), PAGE);
  mod("z", h1, true);
  assert.match(e.text(), /old link<\/a>abc<\/h1>/);
  assert.equal(e.press("mod+z", { ui: { textEditing: true } }).handled, false, "editor undo is gated off while editing text");
});

test("txt: a press on a link or bold inside a paragraph selects the paragraph; the second press edits it", async () => {
  const { e, doc } = await mount();
  const a = doc.querySelector("h1 a")!;
  await fireIn(a, "mousedown");
  await fireIn(a, "mouseup", { clientX: 50 });
  assert.equal(e.state.selection.primary, e.get("h1"), "the h1, not the inline <a>");
  await fireIn(doc.querySelector("h1 a")!, "mousedown");
  await wait(5);
  assert.equal(richTextOf(e.state).editing, e.get("h1"), "the text block is the one edited");
});

test("txt: leaving edit mode without typing puts the rendered text back (the canvas does not re-render an unchanged page)", async () => {
  const { e, doc } = await mount();
  const h1 = await editH1(doc);
  assert.ok(h1.classList.contains("ProseMirror"));
  await act(async () => void e.run("richtext.exit"));
  await wait(20);
  const back = doc.querySelector("h1")!;
  assert.equal(back.textContent, "Hello old link", "the text is still there");
  assert.ok(back.querySelector("a"), "with its link");
  assert.ok(!back.classList.contains("ProseMirror") && !back.classList.contains("tiptap"), "TipTap's classes are gone");
  assert.ok(!back.hasAttribute("role") && !back.hasAttribute("contenteditable"));
});
