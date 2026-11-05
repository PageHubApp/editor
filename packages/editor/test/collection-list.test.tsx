// Lists a shop owner can build without Liquid: the Data source panel picks the site's collections by name (with
// field pickers for filter and sort), and the Add panel's "Collection list" tile inserts a card grid bound to one.
import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, type ReactNode } from "react";
import { type Extension } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { collectionRowsFacet, type CollectionInfo, type CollectionRows } from "@pagehub/engine/host";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { ComponentsProvider } from "../src/components.ts";
import { DataSourcePanel } from "../src/features/inspector/DataSourcePanel.tsx";
import { AddPanel } from "../src/features/add/AddPanel.tsx";
import { cardFields, collectionListMarkup } from "../src/features/add/collectionListMarkup.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { actRun, render, type Rendered } from "./harness.tsx";

const F = "index.liquid";
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
  localStorage.clear();
});

const TEAM: CollectionInfo = {
  slug: "team",
  name: "Team",
  count: 3,
  fields: [
    { key: "photo", label: "Photo", kind: "image" },
    { key: "name", label: "Name", kind: "text" },
    { key: "role", label: "Role", kind: "select" },
    { key: "bio", label: "Bio", kind: "richText" },
    { key: "featured", label: "Featured", kind: "boolean" },
  ],
};
const MENU: CollectionInfo = { slug: "menu", name: "Menu", count: 1, fields: [{ key: "title", label: "Dish", kind: "text" }, { key: "price", label: "Price", kind: "number" }] };

function fakeRows(list: CollectionInfo[] = [TEAM, MENU]) {
  const calls = { created: 0 };
  const rows: CollectionRows = { describe: () => null, open() {}, collections: () => list, createCollection: () => void calls.created++ };
  return { rows, calls };
}

function editor(src: string, extra: Extension[] = []): TestEditor {
  return createTestEditor({
    files: { [F]: src },
    extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), liquidKit(), ...extra],
    data: { collections: { team: [{ name: "Ana", role: "Chef" }, { name: "Bo", role: "Host" }, { name: "Cy", role: "Chef" }] } },
  });
}

const mount = async (e: TestEditor, ui: ReactNode) => {
  r = render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>{ui}</ComponentsProvider>
    </EditorStoreProvider>,
  );
  await settle();
};
/** Let the host's collections() promise resolve. */
const settle = () => act(async () => void (await new Promise((res) => setTimeout(res, 0))));
const options = () => [...document.querySelectorAll<HTMLElement>("[role=option]")].map((o) => o.textContent?.trim());
const openSelect = async (id: string) => r!.click(document.getElementById(`input-${id}`)!);
const choose = async (id: string, text: string) => {
  await openSelect(id);
  await r!.click([...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === text)!);
};

describe("Data source: the site's collections by name", () => {
  it("Source lists host collections with entry counts (no `collections` trap); picking one writes collections.<slug>", async () => {
    const { rows } = fakeRows();
    const e = editor(`<main>\n  <p>Hi</p>\n</main>\n`, [collectionRowsFacet.of(rows)]);
    await mount(e, <DataSourcePanel handle={e.get("p")} />);
    await openSelect("ds-source");
    const opts = options();
    assert.deepEqual(opts.slice(0, 2), ["Team (3 entries)", "Menu (1 entry)"]);
    assert.ok(opts.includes("Products"), "store products stay");
    assert.ok(!opts.includes("collections"), "the collections object isn't offered as a list");
    assert.equal(opts.at(-1), "New collection…");
    assert.ok(document.querySelector("[data-ds-advanced]"), "the Liquid field is folded away");
    await r!.click([...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === "Team (3 entries)")!);
    assert.equal(e.text(), `<main>\n  {% for item in collections.team %}\n    <p>Hi</p>\n  {% endfor %}\n</main>\n`);
  });

  it("New collection… opens the host's form and binds nothing", async () => {
    const { rows, calls } = fakeRows();
    const src = `<main>\n  <p>Hi</p>\n</main>\n`;
    const e = editor(src, [collectionRowsFacet.of(rows)]);
    await mount(e, <DataSourcePanel handle={e.get("p")} />);
    await choose("ds-source", "New collection…");
    assert.equal(calls.created, 1);
    assert.equal(e.text(), src);
  });

  it("bound to a known collection: Field / Sort pick by name, Yes/No and choice values are offered, Split is hidden", async () => {
    const { rows } = fakeRows();
    const src = `<div class="grid">{% for item in collections.team %}<article class="card">{{ item.name }}</article>{% endfor %}</div>`;
    const e = editor(src, [collectionRowsFacet.of(rows)]);
    await mount(e, <DataSourcePanel handle={e.get(".card")} />);
    assert.equal(document.getElementById("input-ds-split"), null, "a list has nothing to split");
    assert.match(document.getElementById("input-ds-source")!.textContent!, /Team \(3 entries\)/);

    await choose("ds-sort", "Name");
    assert.match(e.text(), /\{% assign teamRows = collections\.team \| sort: "name" %\}\s*\{% for item in teamRows %\}/);

    await r!.click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add filter")!);
    await openSelect("ds-where-prop-0");
    assert.deepEqual(options(), ["Photo", "Name", "Role", "Bio", "Featured"]);
    await r!.click([...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === "Featured")!);
    assert.match(e.text(), /where: "featured", true \| sort: "name"/, "a Yes/No field compares to a boolean");
    await choose("ds-where-val-0", "No");
    assert.match(e.text(), /where: "featured", false/);

    await choose("ds-where-prop-0", "Role");
    await openSelect("ds-where-val-0");
    assert.deepEqual(options(), ["Chef", "Host"], "a choice field offers the values its entries use");
    await r!.click([...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === "Host")!);
    assert.match(e.text(), /where: "role", "Host" \| sort: "name"/);
  });

  it("without a host listing: no `collections` entry, the Liquid field shows, sort stays free text", async () => {
    const e = editor(`<main>\n  <p>Hi</p>\n</main>\n`);
    await mount(e, <DataSourcePanel handle={e.get("p")} />);
    assert.ok(document.getElementById("input-ds-custom"), "free text is the way to name a source");
    assert.equal(document.querySelector("[data-ds-advanced]"), null);
    await openSelect("ds-source");
    assert.ok(!options().includes("collections"));
    assert.ok(!options().includes("New collection…"));
  });
});

describe("Add panel: Collection list tile", () => {
  const PAGE = `<main class="p-4">\n  <h1>A</h1>\n</main>\n`;
  const mountAdd = async (e: TestEditor) => {
    actRun(e, "insert.open");
    await mount(e, <AddPanel />);
  };

  it("hidden without a host listing", async () => {
    const e = editor(PAGE);
    await mountAdd(e);
    assert.equal(document.querySelector('[data-tile="collection-list"]'), null);
  });

  it("asks which collection, inserts a card grid bound to its fields, and selects the repeated card", async () => {
    const { rows, calls } = fakeRows();
    const e = editor(PAGE, [collectionRowsFacet.of(rows)]);
    await mountAdd(e);
    const tile = document.querySelector<HTMLElement>('[data-tile="collection-list"]')!;
    assert.ok(tile.closest('[data-tile-category="Lists"]'));
    await r!.click(tile);
    assert.ok(document.querySelector('[data-collection-pick="team"]'));
    assert.match(document.querySelector('[data-collection-pick="team"]')!.textContent!, /Team.*3 entries/);
    await r!.click(document.querySelector('[data-collection-pick=""]')!);
    assert.equal(calls.created, 1, "New collection… opens the host's form");
    assert.equal(e.text(), PAGE);

    await r!.click(document.querySelector<HTMLElement>('[data-tile="collection-list"]')!);
    await r!.click(document.querySelector('[data-collection-pick="team"]')!);
    const text = e.text();
    assert.match(text, /\{% for item in collections\.team %\}/);
    assert.match(text, /<img [^>]*src="\{\{ item\.photo \| image_url: width: 600 \}\}" alt="\{\{ item\.name \}\}"/);
    assert.match(text, /<h3[^>]*>\{\{ item\.name \}\}<\/h3>/);
    assert.match(text, /\{\{ item\.bio \| strip_html \| truncate: 140 \}\}/);
    assert.match(text, /\{% else %\}[\s\S]*Nothing here yet[\s\S]*\{% endfor %\}/);
    assert.match(text, /grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm/);
    assert.equal(e.state.selection.primary?.tag, "article", "the repeated card is selected");
    assert.ok(e.undo());
    assert.equal(e.text(), PAGE, "one undo step");
  });

  it("the card picks fields by kind: first photo, first text as title, a price-named number", () => {
    assert.deepEqual(cardFields(MENU.fields), { image: undefined, title: "title", text: undefined, number: "price" });
    const html = collectionListMarkup(MENU);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /<h2[^>]*>Menu<\/h2>/);
    assert.match(html, /\{\{ item\.price \}\}/);
  });
});
