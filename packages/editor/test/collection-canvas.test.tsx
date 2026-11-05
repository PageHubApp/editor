import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { collectionRowsFacet, type CollectionInfo, type CollectionRows } from "@pagehub/engine/host";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit, canvasOf } from "../src/features/canvas/canvasState.ts";
import type { CanvasHost } from "../src/features/canvas/canvasHost.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, wait } from "./canvasHarness.tsx";

// A shop owner's lists on the canvas: an empty list shows where it is and offers its first entry, a repeated card
// offers another entry, and a detail page says which entry it previews and switches it.
const P = "index.liquid";
const LIST = `<main class="p-4">
  <div class="grid">{% for p in collections.products %}<article class="card"><h3 class="t">{{ p.title }}</h3></article>{% endfor %}</div>
</main>
`;
const DETAIL = `{% assign rows = collections.plants | where: 'slug', request.params.slug %}<main>{% for p in rows %}<h1 class="t">{{ p.title }}</h1>{% endfor %}</main>
`;
const PRODUCTS: CollectionInfo = { slug: "products", name: "Produits", fields: [{ key: "title", label: "Title", kind: "text" }], count: 0 };
const PLANTS: CollectionInfo = { slug: "plants", name: "Plants", fields: [{ key: "slug", label: "Slug", kind: "text" }, { key: "title", label: "Title", kind: "text" }], count: 2 };

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
});

function fakeRows(list: CollectionInfo[]): CollectionRows & { created: string[] } {
  const created: string[] = [];
  return {
    created,
    describe: () => null,
    open: () => undefined,
    collections: () => Promise.resolve(list),
    createEntry: (slug) => void created.push(slug),
  };
}

async function mount(page: string, rows: CollectionRows | null, data: Record<string, unknown>) {
  const e = createTestEditor({ files: { [P]: page }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), ...(rows ? [collectionRowsFacet.of(rows)] : [])] });
  const host: CanvasHost = { data: () => data };
  const r = render(<Editor editor={e} canvasHost={host} />);
  mounted = r;
  const doc = await rendered(r);
  await wait(10);
  return { r, e, doc };
}

test("empty list: a placeholder where the list is, and Add an entry opens the host's form; nothing is stored", async () => {
  const rows = fakeRows([PRODUCTS]);
  const { r, e, doc } = await mount(LIST, rows, { collections: { products: [] } });
  const marker = doc.querySelector("ph-empty-list")!;
  assert.ok(marker, "the canvas copy marks the empty list's spot");
  assert.ok(marker.hasAttribute("data-ph-shown"), "the marked spot takes room on the canvas");
  const box = r.get("[data-empty-list='products']");
  assert.match(box.textContent!, /No Produits entries yet/);
  const add = r.get("[data-empty-list-add='products']");
  assert.equal(add.textContent, "Add an entry");
  assert.equal(add.hasAttribute("title"), false);
  await act(async () => void (add as HTMLButtonElement).click());
  assert.deepEqual(rows.created, ["products"]);
  assert.equal(e.text(), LIST, "the stored file never gets the placeholder");
});

test("empty list: with no host listing, the placeholder text only; a list with entries shows none", async () => {
  const none = await mount(LIST, null, { collections: { products: [] } });
  assert.match(none.r.get("[data-empty-list='products']").textContent!, /No Products entries yet/);
  assert.equal(none.r.container.querySelector("[data-empty-list-add]"), null);
  none.r.unmount();
  mounted = null;

  const full = await mount(LIST, fakeRows([{ ...PRODUCTS, count: 1 }]), { collections: { products: [{ id: "a", title: "Mug" }] } });
  assert.equal(full.doc.querySelector("ph-empty-list"), null);
  assert.equal(full.r.container.querySelector("[data-empty-list]"), null);
});

test("add entry: a selected card of a collection's list offers + Add entry next to repeated ×N", async () => {
  const rows = fakeRows([{ ...PRODUCTS, count: 2 }]);
  const { r, doc } = await mount(LIST, rows, { collections: { products: [{ id: "a", title: "Mug" }, { id: "b", title: "Cap" }] } });
  await fireIn(doc.querySelectorAll("article.card")[1]!, "mousedown");
  await wait(5);
  assert.equal(r.get("[data-repeated]").textContent, "repeated ×2");
  const add = r.get("[data-add-entry='products']");
  assert.equal(add.textContent, "Add entry");
  await act(async () => void (add as HTMLButtonElement).click());
  assert.deepEqual(rows.created, ["products"]);
});

test("detail page: Previewing names the entry shown, and picking another renders it (kept per page)", async () => {
  const plants = [{ id: "1", slug: "monstera", title: "Monstera" }, { id: "2", slug: "fern", title: "Fern" }];
  const { r, e, doc } = await mount(DETAIL, fakeRows([PLANTS]), { collections: { plants } });
  assert.equal(doc.querySelector("h1.t")?.textContent, "Monstera");
  const trigger = r.get("[data-preview-entry]");
  assert.match(trigger.textContent!, /Previewing:\s*Monstera/);
  await r.click(trigger);
  await r.click(r.get("[data-preview-option='fern']"));
  const next = await rendered(r, 2);
  assert.equal(next.querySelector("h1.t")?.textContent, "Fern");
  assert.deepEqual(canvasOf(e.state).previewParams[P], { slug: "fern" });
  await wait(5);
  assert.match(r.get("[data-preview-entry]").textContent!, /Previewing:\s*Fern/);
});

test("detail page: no switcher on a page that doesn't pick an entry", async () => {
  const { r } = await mount(LIST, fakeRows([PRODUCTS]), { collections: { products: [] } });
  assert.equal(r.container.querySelector("[data-preview-entry]"), null);
});
