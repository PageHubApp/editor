import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { collectionRowsFacet, type CollectionRows } from "@pagehub/engine/host";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import type { CanvasHost } from "../src/features/canvas/canvasHost.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { RichTextLayer } from "../src/features/richtext/RichTextLayer.tsx";
import { richTextKit } from "../src/features/richtext/richTextState.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, wait } from "./canvasHarness.tsx";

// A product card rendered once per entry: clicking the 2nd card's photo or text must offer that card's entry, so the
// author changes one product instead of every card. The canvas render marks each copy with its entry (`data-edit-row`)
// and the fields it shows (`data-edit-field`), from the `{{ p.x }}` outputs the element prints.
const P = "index.liquid";
const PAGE = `<main class="p-4">
  {% for p in products %}<article class="card"><img class="ph" src="/{{ p.image }}" alt="{{ p.title }}"><p class="desc">{{ p.description }}</p></article>{% endfor %}
</main>
`;
const PRODUCTS = [
  { id: "p1", title: "T-shirt technique", image: "p1.png", description: "Soft cotton" },
  { id: "p2", title: "Mug", image: "p2.png", description: "Holds tea" },
  { id: "", title: "Sample", image: "s.png", description: "No entry" },
];

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
});

function fakeRows(): CollectionRows & { opened: Array<{ rowId: string; field?: string | null }> } {
  const opened: Array<{ rowId: string; field?: string | null }> = [];
  return {
    opened,
    describe: (rowId) => {
      const p = PRODUCTS.find((x) => x.id === rowId);
      return p ? Promise.resolve({ collection: "Produits", title: p.title }) : null;
    },
    open: (ref) => void opened.push(ref),
  };
}

async function mount(rows: CollectionRows | null, host: CanvasHost = { data: () => ({ products: PRODUCTS }) }) {
  const e = createTestEditor({ files: { [P]: PAGE }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit(), ...(rows ? [collectionRowsFacet.of(rows)] : [])] });
  const r = render(<Editor editor={e} canvasHost={host} components={{ InlineTextToolbar: RichTextLayer }} />);
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

test("entry: the 2nd card's photo offers its own entry; the button opens it at the photo field", async () => {
  const rows = fakeRows();
  const { r, doc } = await mount(rows);
  await fireIn(doc.querySelectorAll("img.ph")[1]!, "mousedown");
  await wait(5);
  assert.equal(r.get("[data-repeated]").textContent, "repeated ×3");
  const btn = r.get("[data-edit-entry]");
  assert.equal(btn.textContent, 'Change photo of "Mug"');
  assert.equal(btn.hasAttribute("title"), false);
  assert.match(btn.getAttribute("data-tooltip-content")!, /remove it from every copy/);
  await act(async () => void (btn as HTMLButtonElement).click());
  assert.deepEqual(rows.opened, [{ rowId: "p2", field: "image" }]);

  // the 1st card names the 1st entry
  await fireIn(doc.querySelectorAll("img.ph")[0]!, "mousedown");
  await wait(5);
  assert.equal(r.get("[data-edit-entry]").textContent, 'Change photo of "T-shirt technique"');
});

test("entry: a copy with no entry (empty data-edit-row) and an editor with no host show no button", async () => {
  const withHost = await mount(fakeRows());
  await fireIn(withHost.doc.querySelectorAll("img.ph")[2]!, "mousedown");
  await wait(5);
  assert.ok(withHost.r.container.querySelector("[data-repeated]"));
  assert.equal(withHost.r.container.querySelector("[data-edit-entry]"), null);
  withHost.r.unmount();
  mounted = null;

  const noHost = await mount(null);
  await fireIn(noHost.doc.querySelectorAll("img.ph")[1]!, "mousedown");
  await wait(5);
  assert.ok(noHost.r.container.querySelector("[data-repeated]"));
  assert.equal(noHost.r.container.querySelector("[data-edit-entry]"), null);
});

test("entry: editing the 2nd card's text edits that copy, and the notice offers its entry at the description", async () => {
  const rows = fakeRows();
  const { r, doc } = await mount(rows);
  const second = doc.querySelectorAll("p.desc")[1]!;
  await editAt(second);
  assert.ok(second.hasAttribute("data-rt-editing"), "the clicked copy is the one being edited");
  assert.equal(doc.querySelectorAll("p.desc")[0]!.hasAttribute("data-rt-editing"), false);
  await wait(5);
  assert.equal(r.get("[data-rt-entry-line] span").textContent, "Description comes from Produits.");
  const btn = r.get("[data-rt-repeat-notice] [data-edit-entry]");
  assert.equal(btn.textContent, 'Edit "Mug"');
  await act(async () => void (btn as HTMLButtonElement).click());
  assert.deepEqual(rows.opened, [{ rowId: "p2", field: "description" }]);

  // typing over the field is refused; the notice points at the entry instead of "Collections"
  const ed = (second as unknown as { editor: import("@tiptap/core").Editor }).editor;
  await act(async () => void ed.chain().selectAll().insertContent("Same for all").run());
  const notice = r.get("[data-rt-repeat-notice]");
  assert.equal(notice.getAttribute("data-rt-repeat-notice"), "blocked");
  assert.doesNotMatch(notice.textContent!, /Collections/);
  assert.equal(notice.querySelector("[data-edit-entry]")?.textContent, 'Edit "Mug"');
});

test("entry: with no host the notice keeps its plain text", async () => {
  const { r, doc } = await mount(null);
  await editAt(doc.querySelectorAll("p.desc")[1]!);
  assert.equal(r.get("[data-rt-repeat-notice]").textContent, "This text shows on all 3 copies. Words you type here change every copy.");
  assert.equal(r.container.querySelector("[data-edit-entry]"), null);
});

test("canvas.reloadData renders again with fresh host data", async () => {
  let calls = 0;
  const { r, e, doc: first } = await mount(null, { data: () => ({ products: [{ id: "p1", title: "A", description: calls++ ? "Fresh" : "Old" }] }) });
  assert.equal(first.querySelector("p.desc")?.textContent, "Old");
  await act(async () => void e.run("canvas.reloadData"));
  const doc = await rendered(r, 2);
  assert.equal(doc.querySelector("p.desc")?.textContent, "Fresh");
  assert.equal(calls, 2);
});
