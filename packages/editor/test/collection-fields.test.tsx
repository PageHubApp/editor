import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, type ReactNode } from "react";
import { variableCatalogue } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { collectionRowsFacet, type CollectionInfo, type CollectionRows } from "@pagehub/engine/host";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { ComponentsProvider } from "../src/components.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { fieldLabel, loopCollection, withFields } from "../src/features/liquid/collectionFields.ts";
import { ImageSrcControl } from "../src/features/inspector/controls/MediaControls.tsx";
import { RowControl } from "../src/features/inspector/PropertyRow.tsx";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { RichTextLayer } from "../src/features/richtext/RichTextLayer.tsx";
import { richTextKit } from "../src/features/richtext/richTextState.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, wait } from "./canvasHarness.tsx";
import { pageEditor, select } from "./inspectorFixture.tsx";

const P = "index.liquid";
const PRODUCTS: CollectionInfo = {
  slug: "products",
  name: "Products",
  count: 0,
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "price", label: "Price", kind: "number" },
    { key: "photo", label: "Photo", kind: "image" },
    { key: "cover", label: "Cover", kind: "media" },
  ],
};
const rows = (list: readonly CollectionInfo[] = [PRODUCTS]): CollectionRows => ({ describe: () => null, open: () => {}, collections: () => list });

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
  localStorage.clear();
});

test("fields: an element in a loop over a collection gets its schema (labels, kinds), first, even with no entries", () => {
  const e = pageEditor({ [P]: `<main>{% for item in collections.products %}<p class="d">x</p>{% endfor %}<p class="out">y</p></main>` }, [liquidKit()]);
  const loop = loopCollection(e.get("p.d"), [PRODUCTS]);
  assert.equal(loop?.item, "item");
  assert.equal(loop?.collection.slug, "products");
  assert.equal(loopCollection(e.get("p.out"), [PRODUCTS]), null, "outside the loop: nothing");
  assert.equal(loopCollection(e.get("p.d"), []), null, "a host that lists no collections: nothing");

  const groups = withFields(variableCatalogue({ state: e.state, data: { company: { name: "Acme" }, item: { title: "Sample" } } }), loop);
  assert.equal(groups[0]!.name, "Products");
  assert.deepEqual(
    groups[0]!.items.map((i) => [i.expression, i.label, i.hint]),
    [
      ["item.title", "Title", "text"],
      ["item.price", "Price", "number"],
      ["item.photo", "Photo", "photo"],
      ["item.cover", "Cover", "file"],
    ],
  );
  assert.ok(!groups.slice(1).some((g) => g.items.some((i) => i.expression === "item.title")), "the sample data's copy of a field is not listed twice");
  assert.ok(groups.some((g) => g.name === "Company"), "the rest of the catalogue stays");
  assert.equal(fieldLabel(loop, "{{ item.price | money }}"), "Price");
  assert.equal(fieldLabel(loop, "{{ company.name }}"), null);
});

test("fields: a loop over an assign of the collection (managed or elsewhere in the file) and a bare slug count too", () => {
  const managed = pageEditor({ [P]: `<main>{% assign list = collections.products | sort: "price" %}{% for p in list %}<p class="d">x</p>{% endfor %}</main>` }, [liquidKit()]);
  assert.equal(loopCollection(managed.get("p.d"), [PRODUCTS])?.item, "p");
  const src = `{% assign featured = collections.products | where: "price", "1" %}<main><div>{% for p in featured %}<p class="d">x</p>{% endfor %}</div></main>`;
  const far = pageEditor({ [P]: src }, [liquidKit()]);
  assert.equal(loopCollection(far.get("p.d"), [PRODUCTS], src)?.collection.name, "Products");
  const bare = pageEditor({ [P]: `<main>{% for p in products %}<p class="d">x</p>{% endfor %}</main>` }, [liquidKit()]);
  assert.equal(loopCollection(bare.get("p.d"), [PRODUCTS])?.item, "p");
});

// ── rich text: the `{{` list and the chips ──

const CARD = `<main>{% for item in collections.products %}<article><h3 class="t">{{ item.title }}</h3><p class="d">Hello</p></article>{% endfor %}</main>\n`;

async function editText(selector: string) {
  const e = createTestEditor({ files: { [P]: CARD }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit(), collectionRowsFacet.of(rows())] });
  // one sample entry that lacks most fields: the list must come from the schema, not the data
  const r = render(<Editor editor={e} canvasHost={{ data: () => ({ collections: { products: [{ title: "Mug" }] } }) }} components={{ InlineTextToolbar: RichTextLayer }} />);
  mounted = r;
  const doc = await rendered(r);
  const el = doc.querySelector(selector)!;
  await fireIn(el, "mousedown");
  await fireIn(el, "mouseup", { clientX: 50 });
  await fireIn(el, "mousedown");
  await wait(5);
  const ed = (doc.querySelector("[data-rt-editing]") as unknown as { editor: import("@tiptap/core").Editor }).editor;
  return { e, r, doc, ed };
}

test("fields: typing `{{` in a repeated card lists the collection's fields first, by name with their kind; a pick writes item.<key> and the chip reads as the name", async () => {
  const { e, r, ed } = await editText("p.d");
  act(() => void ed.commands.setTextSelection({ from: 6, to: 6 }));
  act(() => void ed.commands.insertContent(" {{ "));
  const items = () => r.all("[data-rt-suggest-item]");
  assert.deepEqual(items().slice(0, 4).map((i) => i.getAttribute("data-rt-suggest-item")), ["item.title", "item.price", "item.photo", "item.cover"]);
  const price = r.get('[data-rt-suggest-item="item.price"]');
  assert.match(price.textContent!, /^Pricenumber/);
  assert.equal(price.querySelector("[data-rt-suggest-hint]")?.textContent, "number");

  act(() => void ed.commands.insertContent("pri"));
  assert.deepEqual(items().map((i) => i.getAttribute("data-rt-suggest-item")), ["item.price"], "filtering matches the name");
  await r.click(items()[0]!);
  const chip = ed.view.dom.querySelector("[data-rt-liquidoutput]") as HTMLElement;
  assert.equal(chip.textContent, "Price", "the chip shows the field's name");
  assert.equal(chip.getAttribute("data-tooltip-content"), "{{ item.price }}", "the expression is in its tooltip");
  assert.equal(chip.hasAttribute("title"), false);
  await act(async () => void e.select(e.get("main")));
  assert.match(e.text(), /<p class="d">Hello {{ item\.price }}<\/p>/, "the stored source is the expression");
});

test("fields: an existing field chip reads as its name; the source is unchanged when editing ends", async () => {
  const { e, ed } = await editText("h3.t");
  const chip = ed.view.dom.querySelector("[data-rt-liquidoutput]") as HTMLElement;
  assert.equal(chip.textContent, "Title");
  assert.equal(chip.getAttribute("data-rt-liquidoutput"), "{{ item.title }}");
  await act(async () => void e.select(e.get("main")));
  assert.equal(e.text(), CARD);
});

// ── inspector: alt text and the image's field picker ──

const IMG_CARD = `<main>{% for item in collections.products %}<img src="{{ 'abc' | image_url: width: 600 }}" alt="Photo of {{ item.title }}">{% endfor %}</main>`;

function inspect(src: string, ui: (e: TestEditor) => ReactNode, list?: readonly CollectionInfo[]) {
  const e = pageEditor({ [P]: src }, [liquidKit(), collectionRowsFacet.of(rows(list))]);
  select(e, "img");
  mounted = render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>{ui(e)}</ComponentsProvider>
    </EditorStoreProvider>,
  );
  return e;
}
const settle = () => act(() => new Promise<void>((res) => setTimeout(res, 5)));
const options = () => [...document.querySelectorAll<HTMLElement>("[role=option]")].map((o) => o.textContent?.trim());
const option = (text: string) => [...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === text)!;

test("fields: alt text offers the collection's fields by name (no entries needed); a field chip reads as its name", async () => {
  const e = inspect(IMG_CARD, (ed) => <RowControl row={inspectorRows().find((x) => x.id === "alt")!} handle={ed.get("img")} />);
  await settle();
  const chip = document.querySelector("[data-bound-chip]")!;
  assert.equal(chip.firstChild?.textContent, "Title");
  assert.equal(chip.getAttribute("data-tooltip-content"), "{{ item.title }}");
  await mounted!.click(document.getElementById("input-alt-insert-variable")!);
  assert.deepEqual(options().slice(0, 4), ["Title · text", "Price · number", "Photo · photo", "Cover · file"]);
  await mounted!.click(option("Price · number"));
  assert.match(e.text(), /alt="Photo of {{ item\.title }}{{ item\.price }}"/);
});

test("fields: an image in a repeated card picks a photo field (the bound image_url form) and goes back to a fixed image", async () => {
  const e = inspect(IMG_CARD, (ed) => <ImageSrcControl handle={ed.get("img")} />);
  await settle();
  const from = () => document.getElementById("input-image-src-field")!;
  assert.ok(from(), "the From row is offered inside the loop");
  assert.match(from().textContent!, /A fixed image/);
  await mounted!.click(from());
  assert.deepEqual(options(), ["A fixed image", "Photo", "Cover"], "only photo / file fields");
  await mounted!.click(option("Photo"));
  assert.match(e.text(), /src="{{ item\.photo \| image_url: width: 600 }}"/, "keeps the size already written");
  const bound = document.querySelector("[data-media-bound]")!;
  assert.equal(bound.textContent, "Photo", "the Source chip reads as the field's name");
  assert.equal(bound.getAttribute("data-tooltip-content"), "{{ item.photo }}");
  assert.match(from().textContent!, /Photo/);

  await mounted!.click(from());
  await mounted!.click(option("A fixed image"));
  assert.doesNotMatch(e.text(), /item\.photo/, "back to a fixed image: the binding is gone");
});

test("fields: a new field image is written at the card size; no From row outside a collection loop", async () => {
  const e = inspect(`<main>{% for item in collections.products %}<img src="" alt="x">{% endfor %}</main>`, (ed) => <ImageSrcControl handle={ed.get("img")} />);
  await settle();
  await mounted!.click(document.getElementById("input-image-src-field")!);
  await mounted!.click(option("Cover"));
  assert.match(e.text(), /src="{{ item\.cover \| image_url: width: 800 }}"/);
  mounted!.unmount();
  mounted = null;
  inspect(`<main><img src="a.png" alt="x"></main>`, (ed) => <ImageSrcControl handle={ed.get("img")} />);
  await settle();
  assert.equal(document.getElementById("input-image-src-field"), null);
});
