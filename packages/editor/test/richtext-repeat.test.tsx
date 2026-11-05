import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { RichTextLayer } from "../src/features/richtext/RichTextLayer.tsx";
import { richTextKit } from "../src/features/richtext/richTextState.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, wait } from "./canvasHarness.tsx";

// Text inside a loop is the template for every row: typing over its `{{ … }}` field would give every row the same
// words. A shop's product cards lost every description that way, so the session keeps those fields.
const P = "index.liquid";
const PAGE = `<main class="p-4">
  <ul>{% for x in (1..3) %}<li class="row">Item {{ x }}</li>{% endfor %}</ul>
  <p class="one">Hello {{ x }}</p>
</main>
`;

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
});

async function mount() {
  const e = createTestEditor({ files: { [P]: PAGE }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit()] });
  const r = render(<Editor editor={e} components={{ InlineTextToolbar: RichTextLayer }} />);
  mounted = r;
  const doc = await rendered(r);
  return { r, e, doc };
}

/** Select an element and click it again: edit mode. */
async function editAt(el: Element) {
  await fireIn(el, "mousedown");
  await fireIn(el, "mouseup", { clientX: 50 });
  await fireIn(el, "mousedown");
  await wait(5);
}

const sessionEditor = (doc: Document) => (doc.querySelector("[data-rt-editing]") as unknown as { editor: import("@tiptap/core").Editor }).editor;

test("repeat: text in a loop says it shows on every copy; typing over its field is refused and explained, words around it still change", async () => {
  const { e, r, doc } = await mount();
  await editAt(doc.querySelectorAll("li.row")[1]!);
  assert.equal(r.get("[data-rt-repeat-notice]").textContent, "This text shows on all 3 copies. Words you type here change every copy.");

  const ed = sessionEditor(doc);
  await act(async () => void ed.chain().selectAll().insertContent("Same for all").run());
  assert.match(ed.getHTML(), /data-rt-liquidOutput="\{\{ x \}\}"/i, "the field survives select-all + type");
  assert.equal(r.get("[data-rt-repeat-notice]").getAttribute("data-rt-repeat-notice"), "blocked");
  assert.match(r.get("[data-rt-repeat-notice]").textContent!, /edit its entry in Collections/);

  await act(async () => void ed.chain().focus("end").insertContent("!").run());
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<li class="row">Item \{\{ x \}\}!<\/li>/);
});

test("repeat: text that renders once has no notice, and its field can be deleted", async () => {
  const { e, r, doc } = await mount();
  await editAt(doc.querySelector("p.one")!);
  assert.equal(r.container.querySelector("[data-rt-repeat-notice]"), null);
  const ed = sessionEditor(doc);
  await act(async () => void ed.chain().selectAll().insertContent("Plain").run());
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<p class="one">Plain<\/p>/);
});
