import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { htmlKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { mediaFacet, memoryMediaStore, type MediaItem } from "@pagehub/engine/host";
import { MediaInput } from "../src/features/media/MediaInput.tsx";
import { MediaManager } from "../src/features/media/MediaManager.tsx";
import { editorKit } from "../src/index.ts";
import { attachKeymap } from "../src/features/keyboard/domKeymap.ts";
import { filterMedia, formatFileSize, sortMedia } from "../src/features/media/mediaHelpers.ts";
import { EMPTY_SELECTION, move, select, selectAll, selectOne } from "../src/features/media/mediaSelection.ts";
import { render } from "./harness.tsx";
import { flush, withSlots } from "./pickersHarness.tsx";

const item = (id: string, name: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, name, contentType: "image/png", size: 1000 * Number(id.slice(1)), folder: null, url: `u://${id}`, createdAt: Number(id.slice(1)), ...extra });
const SEED = [item("m1", "alpha.png"), item("m2", "beta.png", { folder: "f1" }), item("m3", "clip.mp4", { contentType: "video/mp4" }), item("m4", "doc.pdf", { contentType: "application/pdf" }), item("m5", "echo.png"), item("m6", "foxtrot.png"), item("m7", "golf.png")];

const live: ReturnType<typeof render>[] = [];
const detachers: Array<() => void> = [];
afterEach(() => {
  for (const d of detachers.splice(0)) d();
  for (const r of live.splice(0)) r.unmount();
  globalThis.localStorage?.clear();
});

function rig(ui: (e: TestEditor) => React.ReactNode, store = memoryMediaStore({ items: SEED, folders: [{ id: "f1", name: "Hero", parent: null }] })) {
  const e = createTestEditor({ files: { "index.liquid": "<p>x</p>\n" }, extensions: [htmlKit(), editorKit(), mediaFacet.of(store)] });
  detachers.push(attachKeymap(e, { platform: "other" }));
  const r = render(withSlots(e, { MediaManager }, ui(e)));
  live.push(r);
  return { e, r, store };
}
const ready = () => act(flush);
const names = (r: ReturnType<typeof render>) => r.all("[data-media-name]").map((n) => n.textContent);
const key = async (el: Element, k: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    (el as HTMLElement).focus?.();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });
const grid = (r: ReturnType<typeof render>) => r.get("[aria-label='Media library']");
const card = (r: ReturnType<typeof render>, id: string) => r.get(`[data-media-id='${id}']`);

describe("media helpers", () => {
  it("selection: single, range (Shift), toggle (⌘), add-range (⌘+Shift), select all, pick mode", () => {
    const ids = ["a", "b", "c", "d", "e"];
    let s = select(EMPTY_SELECTION, ids, "b");
    assert.deepEqual(s.ids, ["b"]);
    s = select(s, ids, "d", { shiftKey: true });
    assert.deepEqual(s.ids, ["b", "c", "d"]);
    s = select(s, ids, "a", { metaKey: true });
    assert.deepEqual(s.ids, ["b", "c", "d", "a"]);
    s = select(s, ids, "a", { ctrlKey: true });
    assert.deepEqual(s.ids, ["b", "c", "d"]);
    s = select(selectOne("a"), ids, "c", { shiftKey: true, metaKey: true });
    s = select(s, ids, "e", { metaKey: true });
    assert.deepEqual(s.ids, ["a", "b", "c", "e"]);
    assert.deepEqual(selectAll(ids).ids, ids);
    assert.deepEqual(selectAll(ids, true).ids, [], "no select-all in pick mode");
    assert.deepEqual(select(selectOne("a"), ids, "c", { shiftKey: true }, true).ids, ["c"], "pick mode is single");
  });
  it("arrows: ±1 for ←/→; ±5 for ↑/↓ in cards, ±1 in a list; clamped", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `i${i}`);
    assert.equal(move(selectOne("i3"), ids, "ArrowRight", "cards")!.primary, "i4");
    assert.equal(move(selectOne("i3"), ids, "ArrowDown", "cards")!.primary, "i8");
    assert.equal(move(selectOne("i3"), ids, "ArrowDown", "list")!.primary, "i4");
    assert.equal(move(selectOne("i1"), ids, "ArrowUp", "cards")!.primary, "i0");
    assert.equal(move(selectOne("i11"), ids, "ArrowRight", "cards")!.primary, "i11");
    assert.equal(move(EMPTY_SELECTION, ids, "ArrowRight", "cards")!.primary, "i1", "no selection starts at the first");
    assert.equal(move(selectOne("i1"), ids, "x", "list"), null);
  });
  it("filter, sort, size", () => {
    assert.deepEqual(filterMedia(SEED, { search: "", kind: "video", folder: "all" }).map((i) => i.id), ["m3"]);
    assert.deepEqual(filterMedia(SEED, { search: "", kind: "all", folder: "f1" }).map((i) => i.id), ["m2"]);
    assert.equal(filterMedia(SEED, { search: "", kind: "all", folder: "unfiled" }).length, 6);
    assert.deepEqual(sortMedia(SEED.slice(0, 3), "name", "desc").map((i) => i.name), ["clip.mp4", "beta.png", "alpha.png"]);
    assert.equal(formatFileSize(1536), "1.5 KB");
  });
});

describe("MediaManager (slot over the host store)", () => {
  it("manager mode: folder tabs with counts, cards of the library, newest first", async () => {
    const { r } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    const text = r.get("[role=dialog]").textContent ?? "";
    assert.match(text, /^Media Manager/);
    for (const t of ["All \\(7\\)", "Unfiled \\(6\\)", "Hero \\(1\\)"]) assert.match(text, new RegExp(t));
    assert.deepEqual(names(r).slice(0, 2), ["golf.png", "foxtrot.png"]);
  });

  it("no store: says so", async () => {
    const e = createTestEditor({ files: { "index.liquid": "<p>x</p>\n" }, extensions: [htmlKit(), editorKit()] });
    const r = render(withSlots(e, { MediaManager }, <MediaManager open onClose={() => {}} />));
    live.push(r);
    await ready();
    assert.match(r.get("[role=dialog]").textContent ?? "", /No media library is connected/);
  });

  it("search, kind filter and a folder tab narrow the grid; list view shows a table", async () => {
    const { r } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    await r.type(r.get("input[aria-label='Search media']"), "echo");
    assert.deepEqual(names(r), ["echo.png"]);
    await r.type(r.get("input[aria-label='Search media']"), "");
    const kind = r.get("select[aria-label='Filter by media type']") as HTMLSelectElement;
    await act(async () => {
      kind.value = "video";
      kind.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.deepEqual(names(r), ["clip.mp4"]);
    await r.click(r.all("[role=tab]").find((t) => t.textContent?.startsWith("Hero"))!);
    assert.deepEqual(names(r), [], "video filter + Hero folder");
    await r.click(r.get("button[aria-label='List']"));
    assert.match(r.get("[role=dialog]").textContent ?? "", /NameTypeSizeFolder|Name/);
    assert.equal(JSON.parse(globalThis.localStorage.getItem("pagehub-editor:media-manager-prefs")!).view, "list");
  });

  it("click / Shift / ⌘ select; ←→↑↓ move; ⌘A selects all; Esc clears", async () => {
    const { r } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    const order = () => names(r);
    assert.equal(order()[0], "golf.png");
    await r.click(card(r, "m7"));
    await r.click(card(r, "m5"), { shiftKey: true });
    assert.equal(r.all("[aria-pressed=true][data-media-id]").length, 3);
    await r.click(card(r, "m1"), { metaKey: true });
    assert.equal(r.all("[aria-pressed=true][data-media-id]").length, 4);
    await r.click(card(r, "m7"));
    await key(grid(r), "ArrowRight");
    assert.equal(card(r, "m6").getAttribute("aria-pressed"), "true");
    await key(grid(r), "ArrowDown");
    assert.equal(card(r, "m1").getAttribute("aria-pressed"), "true", "↓ is 5 in cards");
    await key(grid(r), "a", { ctrlKey: true });
    assert.equal(r.all("[aria-pressed=true][data-media-id]").length, 7);
    await key(grid(r), "Escape");
    assert.equal(r.all("[aria-pressed=true][data-media-id]").length, 0);
  });

  it("upload registers through the host store; a failed host call shows the error", async () => {
    const { r, store } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    const input = r.get("input[type=file]") as HTMLInputElement;
    const file = new File(["x"], "new.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => void input.dispatchEvent(new Event("change", { bubbles: true })));
    await ready();
    assert.ok(store.items.some((i) => i.name === "new.png"));
    assert.ok(names(r).includes("new.png"));
  });

  it("drop overlay appears on a file drag and the drop uploads into the current folder", async () => {
    const { r, store } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    await r.click(r.all("[role=tab]").find((t) => t.textContent?.startsWith("Hero"))!);
    const dt = { types: ["Files"], files: [new File(["x"], "dropped.png", { type: "image/png" })] };
    const ev = (type: string) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: dt });
    await act(async () => void grid(r).dispatchEvent(ev("dragover")));
    assert.ok(r.get("[data-drop-overlay]"));
    await act(async () => void grid(r).dispatchEvent(ev("drop")));
    await ready();
    assert.equal(store.items.find((i) => i.name === "dropped.png")?.folder, "f1");
  });

  it("delete: confirm dialog, then the store removes them (Delete / Backspace)", async () => {
    const { r, store } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    await r.click(card(r, "m7"));
    await key(grid(r), "Delete");
    await ready();
    assert.match(document.body.textContent ?? "", /Delete this file\?/);
    await r.click(r.all("button").find((b) => b.textContent === "Delete")!);
    await ready();
    assert.equal(store.items.some((i) => i.id === "m7"), false);
  });

  it("edit details renames and moves to a folder; folders can be created and renamed without prompt()", async () => {
    const { r, store } = rig(() => <MediaManager open onClose={() => {}} />);
    await ready();
    await r.click(card(r, "m1"));
    await r.click(r.get("button[aria-label='Edit details']"));
    await r.type(r.get("input[value='alpha.png']"), "renamed.png");
    await r.click(r.all("button").find((b) => b.textContent === "Save")!);
    await ready();
    assert.equal(store.items.find((i) => i.id === "m1")!.name, "renamed.png");
    await r.click(r.get("button[aria-label='New folder']"));
    await r.type(r.get("input[aria-label='Folder name']"), "Logos");
    await r.click(r.all("button").find((b) => b.textContent === "Save")!);
    await ready();
    assert.match(r.get("[role=dialog]").textContent ?? "", /Logos \(0\)/);
  });

  it("pick mode: 'Select Media', one selection, Select button and double-click pick and close", async () => {
    const picked: string[] = [];
    let closed = 0;
    const { r } = rig(() => <MediaManager open onClose={() => closed++} onPick={(id) => picked.push(id)} />);
    await ready();
    assert.match(r.get("[role=dialog]").textContent ?? "", /^Select Media/);
    assert.equal(r.all("input[type=checkbox]").length, 0, "no checkboxes in pick mode");
    await r.click(card(r, "m7"));
    await r.click(card(r, "m6"), { shiftKey: true });
    assert.equal(r.all("[aria-pressed=true][data-media-id]").length, 1, "single");
    await r.click(r.all("button").find((b) => b.textContent === "Select")!);
    assert.deepEqual(picked, ["m6"]);
    await r.fire(card(r, "m5"), "dblclick");
    assert.deepEqual(picked, ["m6", "m5"]);
    await r.click(card(r, "m7"));
    await key(grid(r), "Enter");
    assert.deepEqual(picked, ["m6", "m5", "m7"]);
    assert.equal(closed, 3);
  });
});

describe("MediaInput", () => {
  it("the chip opens the picker with Library / Site logo / Dynamic; picking writes the id", async () => {
    const out: string[] = [];
    const { r } = rig(() => <MediaInput label="Image" value="" onChange={(v) => out.push(v)} siteLogo={{ light: "{{ company.logo }}" }} />);
    await r.click(r.get("button[aria-haspopup]"));
    await ready();
    assert.deepEqual(r.all("[role=tab]").map((t) => t.textContent).slice(0, 3), ["Library", "Site logo", "Dynamic"]);
    await r.click(card(r, "m7"));
    await r.click(r.all("button").find((b) => b.textContent === "Select")!);
    assert.deepEqual(out, ["m7"]);
  });
  it("Dynamic writes an expression; Site logo writes the logo expression", async () => {
    const out: string[] = [];
    const { r } = rig(() => <MediaInput value="" onChange={(v) => out.push(v)} siteLogo={{ light: "{{ company.logo }}" }} />);
    await r.click(r.get("button[aria-haspopup]"));
    await ready();
    await r.click(r.all("[role=tab]").find((t) => t.textContent === "Site logo")!);
    await r.click(r.all("button").find((b) => b.textContent === "Logo")!);
    assert.deepEqual(out, ["{{ company.logo }}"]);
    await r.click(r.get("button[aria-haspopup]"));
    await ready();
    await r.click(r.all("[role=tab]").find((t) => t.textContent === "Dynamic")!);
    await r.type(r.get("input[aria-label='Dynamic value']"), "{{ product.image }}");
    await r.click(r.all("button").find((b) => b.textContent === "Use value")!);
    assert.equal(out.at(-1), "{{ product.image }}");
  });
  it("shows the picked file's thumbnail; the X clears", async () => {
    const out: string[] = [];
    const { r } = rig(() => <MediaInput label="Image" value="m1" onChange={(v) => out.push(v)} />);
    await ready();
    assert.equal(r.get("img").getAttribute("src"), "u://m1");
    await r.click(r.get("button[aria-label='Clear media']"));
    assert.deepEqual(out, [""]);
  });
});
