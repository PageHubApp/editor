import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { fontCatalogueFacet, type FontFamily } from "@pagehub/engine/host";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { includeInChatFacet, typographyPresetsFacet, type ChatSelection } from "../src/features/richtext/hooks.ts";
import { findTrigger } from "../src/features/richtext/suggest.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { RichTextLayer } from "../src/features/richtext/RichTextLayer.tsx";
import { richTextKit } from "../src/features/richtext/richTextState.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, wait } from "./canvasHarness.tsx";
import { press } from "./keys.ts";

const P = "index.liquid";
const PAGE = `<main><h1 class="text-xl">Hello world</h1></main>\n`;
const FONTS: FontFamily[] = [
  { family: "Roboto", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" },
  { family: "Lora", category: "serif" },
  { family: "Lobster", category: "display" },
  { family: "Fira Code", category: "monospace" },
];
const DATA = { company: { name: "Acme", email: "hi@acme.test" }, shop: { currency: "USD" } };

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
});

const loaded: string[] = [];
function editor(extra: unknown[] = []): TestEditor {
  return createTestEditor({
    files: { [P]: PAGE },
    data: DATA,
    extensions: [
      htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit(),
      fontCatalogueFacet.of({ families: () => FONTS, load: (f) => void loaded.push(f) }),
      typographyPresetsFacet.of([{ name: "Heading", className: "font-heading text-3xl", fontFamily: "Lora" }]),
      ...(extra as []),
    ],
  });
}

async function mount(e = editor()) {
  const r = render(<Editor editor={e} components={{ InlineTextToolbar: RichTextLayer }} />);
  mounted = r;
  const doc = await rendered(r);
  const h1 = doc.querySelector("h1")!;
  await fireIn(h1, "mousedown");
  await fireIn(h1, "mouseup", { clientX: 50 });
  await fireIn(h1, "mousedown");
  await wait(5);
  const ed = (doc.querySelector("[data-rt-editing]") as unknown as { editor: import("@tiptap/core").Editor }).editor;
  return { e, r, doc, ed };
}

test("txt: Font panel — presets + level/size controls; the family reuses the shared FontPicker (search, category dropdown, preview list); hover previews without committing, leaving restores, a click writes font-['Name']", async () => {
  const { e, r, ed } = await mount();
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="Font"]'));
  await wait(5);
  const panel = r.get('[data-rt-panel="font"]');
  assert.deepEqual([...panel.querySelectorAll("[data-rt-presets] button")].map((b) => b.textContent), ["HeadingLora"]);
  assert.deepEqual(r.all('[aria-label="Text level"] button').map((b) => b.textContent), ["Normal", "H1", "H2", "H3", "H4"]);
  assert.deepEqual(r.all('[aria-label="Size"] button').map((b) => b.textContent), ["S", "M", "L", "XL"]);

  // the family control is the shared FontPicker slot, not a second inline font UI
  await r.click(r.get('[data-rt-family] button[aria-haspopup="true"]'));
  await wait(5);
  const list = () => r.all('[role="listbox"][aria-label="Fonts"] [role="option"]').map((o) => o.textContent!.replace("Preview", ""));
  assert.deepEqual(list(), ["Roboto", "Open Sans", "Lora", "Lobster", "Fira Code"]);
  // category dropdown carries counts and filters the list
  await r.click(r.get('button[aria-haspopup="listbox"]'));
  await wait(5);
  const cats = r.all('[role="option"]').map((o) => o.textContent);
  assert.ok(cats.includes("All Fonts (5)") && cats.includes("Serif (1)") && cats.includes("Monospace (1)"), cats.join(","));
  await r.click(r.all('[role="option"]').find((o) => o.textContent === "Serif (1)")!);
  assert.deepEqual(list(), ["Lora"]);
  await r.click(r.get('button[aria-haspopup="listbox"]'));
  await wait(5);
  await r.click(r.all('[role="option"]').find((o) => o.textContent === "All Fonts (5)")!);
  await r.type(r.get('input[aria-label="Search fonts"]'), "lo");
  assert.deepEqual(list(), ["Lora", "Lobster"]);

  const before = e.text();
  await r.fire(r.all('[role="listbox"][aria-label="Fonts"] [role="option"]')[1]!, "mouseover");
  assert.ok(ed.isActive("inlineEl"), "hover previews on the selection");
  await wait(600);
  assert.equal(e.text(), before, "a preview is never written to source");
  assert.ok(loaded.includes("Lobster"));
  await r.fire(r.get('[role="listbox"][aria-label="Fonts"]').parentElement!, "mouseout", { relatedTarget: document.body } as MouseEventInit);
  await r.fire(r.get('[role="listbox"][aria-label="Fonts"]').parentElement!, "mouseleave");
  assert.ok(!ed.isActive("inlineEl"), "leaving puts it back");

  await r.fire(r.all('[role="listbox"][aria-label="Fonts"] [role="option"]')[0]!, "mouseover");
  await r.click(r.all('[role="listbox"][aria-label="Fonts"] [role="option"]')[0]!);
  await wait(600);
  assert.match(e.text(), /<h1 class="text-xl"><span class="font-\['Lora'\]">Hello<\/span> world<\/h1>/);
});

test("txt: size and family share one span; a preset writes its classes and loads its family", async () => {
  const { e, r, ed } = await mount();
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="Font"]'));
  await r.click(r.all('[aria-label="Size"] button').find((b) => b.textContent === "L")!);
  await r.click(r.get('[data-rt-family] button[aria-haspopup="true"]'));
  await wait(5);
  await r.click(r.all('[role="listbox"][aria-label="Fonts"] [role="option"]').find((o) => o.textContent!.startsWith("Open Sans"))!);
  await wait(600);
  assert.match(e.text(), /<span class="text-xl font-\['Open_Sans'\]">Hello<\/span>/);
  loaded.length = 0;
  await r.click(r.get("[data-rt-presets] button"));
  await wait(600);
  assert.match(e.text(), /<span class="font-heading text-3xl">Hello<\/span>/);
  assert.ok(loaded.includes("Lora"));
});

test("txt: Insert variable — More › grouped popover (Company / System / Section / Custom / Other); hover opens a flyout; a pick inserts the chip", async () => {
  const { e, r, ed } = await mount();
  act(() => void ed.commands.setTextSelection({ from: 0, to: 0 }));
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await r.click(r.get('[aria-label="More"]'));
  await r.click(r.get('[aria-label="Insert variable"]'));
  const groups = r.all("[data-rt-var-group]").map((g) => g.getAttribute("data-rt-var-group"));
  assert.deepEqual(groups, ["Company", "System", "Other"]);
  assert.equal(r.all("[data-rt-var-flyout]").length, 1);
  await r.fire(r.get('[data-rt-var-group="Other"]').parentElement!, "mouseover");
  assert.ok(r.get('[data-rt-var-flyout="Other"] [data-rt-var="shop.currency"]'));
  await r.fire(r.get('[data-rt-var-group="Company"]').parentElement!, "mouseover");
  await r.click(r.get('[data-rt-var="company.name"]'));
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<h1 class="text-xl">{{ company.name }} world<\/h1>/);
});

test("txt: typing `{{` lists matching variables; ↓ and Enter insert one in place of the typed text; Esc dismisses", async () => {
  assert.deepEqual(findTrigger("Hi {{ comp"), { length: 7, query: "comp" });
  assert.equal(findTrigger("Hi {{ x }} "), null);
  const { e, r, ed } = await mount();
  act(() => void ed.commands.setTextSelection({ from: 0, to: 0 }));
  act(() => void ed.commands.insertContent("{{ co"));
  const items = () => r.all("[data-rt-suggest-item]").map((i) => i.getAttribute("data-rt-suggest-item"));
  assert.deepEqual(items(), ["company.name", "company.email"]);
  press("ArrowDown", ed.view.dom);
  assert.equal(r.get('[data-rt-suggest-item="company.email"]').getAttribute("aria-selected"), "true");
  press("Escape", ed.view.dom);
  assert.deepEqual(items(), [], "Esc closes the list");
  act(() => void ed.commands.insertContent("m"));
  assert.deepEqual(items(), [], "…until the next `{{`");
  act(() => void ed.commands.insertContent(" {{ co"));
  assert.equal(items().length, 2);
  press("ArrowDown", ed.view.dom);
  press("Enter", ed.view.dom);
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /{{ company\.email }}/);
  assert.ok(!/<h1[^>]*>[^<]*<br/.test(e.text()), "Enter picked; it did not break the line");
});

test("txt: right-click in edited text → text menu with Insert variable; 'Include in chat' only when the host provides one", async () => {
  const chats: ChatSelection[] = [];
  const noHost = await mount();
  act(() => void noHost.ed.commands.setTextSelection({ from: 0, to: 5 }));
  await fireIn(noHost.ed.view.dom, "contextmenu", { clientX: 40, clientY: 40 });
  const menu = () => document.querySelector('[role="menu"][aria-label="Text actions"]');
  assert.ok(menu());
  assert.deepEqual([...menu()!.querySelectorAll("button")].map((b) => b.textContent), ["Insert variable"]);
  mounted!.unmount();
  resetOverlaysForTests();

  const { r, ed } = await mount(editor([includeInChatFacet.of((s) => void chats.push(s))]));
  act(() => void ed.commands.setTextSelection({ from: 0, to: 5 }));
  await fireIn(ed.view.dom, "contextmenu", { clientX: 40, clientY: 40 });
  assert.deepEqual([...menu()!.querySelectorAll("button")].map((b) => b.textContent), ["Include in chat", "Insert variable"]);
  await r.click([...menu()!.querySelectorAll("button")].find((b) => b.textContent === "Include in chat")!);
  assert.equal(chats[0]!.text, "Hello");
  assert.equal(menu(), null, "a pick closes the menu");
  await fireIn(ed.view.dom, "contextmenu", { clientX: 40, clientY: 40 });
  await r.click([...menu()!.querySelectorAll("button")].find((b) => b.textContent === "Insert variable")!);
  assert.ok(r.get('[data-rt-panel="variable"]'));
  await fireIn(ed.view.dom, "contextmenu", { clientX: 40, clientY: 40 });
  press("Escape");
  assert.equal(menu(), null, "Esc closes the whole menu");
});
