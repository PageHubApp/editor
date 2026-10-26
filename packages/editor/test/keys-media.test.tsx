import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { htmlKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { mediaFacet, memoryMediaStore, type MediaItem } from "@pagehub/engine/host";
import { MediaManager } from "../src/features/media/MediaManager.tsx";
import { editorKit } from "../src/index.ts";
import { attachKeymap } from "../src/features/keyboard/domKeymap.ts";
import { render } from "./harness.tsx";
import { flush, withSlots } from "./pickersHarness.tsx";

const item = (id: string, name: string): MediaItem => ({ id, name, contentType: "image/png", size: 1000, folder: null, url: `u://${id}`, createdAt: Number(id.slice(1)) });
const SEED = [item("m1", "a.png"), item("m2", "b.png"), item("m3", "c.png")];

const live: ReturnType<typeof render>[] = [];
const detach: Array<() => void> = [];
afterEach(() => {
  for (const d of detach.splice(0)) d();
  for (const r of live.splice(0)) r.unmount();
  globalThis.localStorage?.clear();
  document.body.innerHTML = "";
});

function rig(pick?: (id: string) => void) {
  const store = memoryMediaStore({ items: SEED, folders: [] });
  const e = createTestEditor({ files: { "index.liquid": "<p>x</p>\n" }, extensions: [htmlKit(), editorKit(), mediaFacet.of(store)] });
  detach.push(attachKeymap(e, { platform: "other" }));
  const r = render(withSlots(e, { MediaManager }, <MediaManager open onClose={() => {}} onPick={pick} />));
  live.push(r);
  return { e, r, store };
}
const ready = () => act(flush);
const grid = (r: ReturnType<typeof render>) => r.get("[aria-label='Media library']") as HTMLElement;
const card = (r: ReturnType<typeof render>, id: string) => r.get(`[data-media-id='${id}']`);
const selected = (r: ReturnType<typeof render>) => r.all("[aria-pressed=true][data-media-id]").map((c) => c.getAttribute("data-media-id"));
/** Press on `el` (focusing it first); true when the keymap took the key. */
async function press(el: Element, k: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    (el as HTMLElement).focus?.();
    el.dispatchEvent(ev);
  });
  return ev.defaultPrevented;
}

describe("media manager keys run through the keymap", () => {
  it("Backspace / Delete delete the selected media (outranking the element delete); with no media selected they pass through to the element", async () => {
    const { e, r, store } = rig();
    await ready();
    e.select(e.get("p"));
    assert.equal(await press(grid(r), "Delete"), true);
    await ready();
    assert.equal(e.state.files.get("index.liquid")?.includes("<p>"), false, "nothing selected in the manager: the element delete ran");
    e.run("history.undo");
    await r.click(card(r, "m2"));
    e.select(e.get("p"));
    assert.equal(await press(grid(r), "Backspace"), true);
    await ready();
    assert.match(document.body.textContent ?? "", /Delete this file\?/, "media confirm, not the element delete");
    await r.click(r.all("button").find((b) => b.textContent === "Delete")!);
    await ready();
    assert.equal(store.items.some((i) => i.id === "m2"), false);
  });

  it("⌘/Ctrl+A selects all media; not in a field", async () => {
    const { r } = rig();
    await ready();
    assert.equal(await press(grid(r), "a", { ctrlKey: true }), true);
    assert.deepEqual(selected(r).sort(), ["m1", "m2", "m3"]);
    const search = r.get("input[type=search], input[placeholder*='earch']") as HTMLElement;
    assert.equal(await press(search, "a", { ctrlKey: true }), false, "a field keeps its own select-all");
  });

  it("in pick mode there is no select-all and Backspace / Delete delete nothing; Enter picks the selected item", async () => {
    const picked: string[] = [];
    const { r, store } = rig((id) => void picked.push(id));
    await ready();
    await r.click(card(r, "m2"));
    assert.equal(await press(grid(r), "a", { ctrlKey: true }), false);
    assert.deepEqual(selected(r), ["m2"]);
    await press(grid(r), "Delete");
    await ready();
    assert.equal(store.items.length, 3);
    assert.equal(await press(grid(r), "Enter"), true);
    assert.deepEqual(picked, ["m2"]);
  });

  it("Escape clears the selection first (a media key above the overlay close)", async () => {
    const { r } = rig();
    await ready();
    await r.click(card(r, "m1"));
    assert.equal(await press(grid(r), "Escape"), true);
    assert.deepEqual(selected(r), []);
  });

  it("Enter previews (and picks in pick mode); ← / → step the open preview", async () => {
    const { r } = rig();
    await ready();
    await r.click(card(r, "m2"));
    assert.equal(await press(grid(r), "Enter"), true);
    await ready();
    const shown = () => document.querySelector("img.object-contain")?.getAttribute("src");
    assert.equal(shown(), "u://m2");
    assert.equal(await press(document.activeElement ?? document.body, "ArrowLeft"), true);
    await ready();
    assert.equal(shown(), "u://m3", "newest first, so ← goes to the previous card in the grid (m3)");
    assert.equal(await press(document.activeElement ?? document.body, "ArrowRight"), true);
    await ready();
    assert.equal(shown(), "u://m2");
    assert.equal(await press(document.activeElement ?? document.body, "ArrowUp"), false, "↑ is not a preview key");
  });

  it("arrow keys move the selection only while focus is inside the manager", async () => {
    const { r } = rig();
    await ready();
    await r.click(card(r, "m3"));
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    assert.equal(await press(outside, "ArrowRight"), false, "focus on the page: the key is not taken");
    assert.equal(await press(grid(r), "ArrowRight"), true);
    assert.deepEqual(selected(r), ["m2"]);
  });
});
