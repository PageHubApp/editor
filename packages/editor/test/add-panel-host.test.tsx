import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { addPanelAiFacet, addPanelUrlFacet, locationBinding, type AddPanelUrlBinding } from "../src/features/add/addPanelHost.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { blockSourceFacet, type BlockItem } from "@pagehub/engine/host";
import { AddPanel } from "../src/features/add/AddPanel.tsx";
import { CATEGORY_WIREFRAMES } from "../src/features/add/categoryWireframes.tsx";
import { CATEGORY_ORDER } from "../src/features/add/useBlocks.ts";
import { actRun, render, withEditor, type Rendered } from "./harness.tsx";
import { press } from "./keys.ts";

const PAGE = `<main>\n  <h1>A</h1>\n</main>\n`;
const block = (slug: string, category: string, extra: Partial<BlockItem> = {}): BlockItem => ({ slug, name: slug.replace(/-/g, " "), category, source: `<section>${slug}</section>`, ...extra });
const BLOCKS = [block("hero-a", "hero"), block("faq-a", "faq"), block("my-one", "hero", { saved: true }), block("zany", "weird")];

let open: Rendered[] = [];
/** Renders share the document, so a test with several editors unmounts the last before the next. */
const unmountAll = () => {
  for (const r of open) r.unmount();
  open = [];
};
afterEach(() => {
  unmountAll();
  localStorage.clear();
  history.replaceState(null, "", "/");
});

function setup(extra: unknown[] = [], blocks: BlockItem[] | false = BLOCKS, openArgs?: Record<string, unknown>) {
  const e: TestEditor = createTestEditor({
    files: { "index.liquid": PAGE },
    extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), ...(blocks ? [blockSourceFacet.of({ blocks: () => blocks })] : []), ...(extra as [])],
  });
  // Open the panel before the first render (a closed→open re-render mid-act wedges the blocks load).
  if (openArgs) actRun(e, "insert.open", openArgs);
  const r = render(withEditor(e, <AddPanel />));
  open.push(r);
  return { e, r };
}
const tabs = (r: Rendered) => r.all('[role="tab"]').map((t) => t.getAttribute("data-add-tab"));

describe("add panel: host hooks and chrome", () => {
  it("tabs: ←/→ cycle them; with no block source the strip is dropped; enabled:false drops the Blocks tab", async () => {
    const { e, r } = setup();
    actRun(e, "insert.open");
    await act(async () => {});
    assert.deepEqual(tabs(r), ["components", "blocks"]);
    const first = r.all('[role="tab"]')[0]!;
    first.focus();
    press("ArrowRight", first);
    assert.equal(addPanelOf(e.state).tab, "blocks");
    press("ArrowRight", r.all('[role="tab"]')[1]!);
    assert.equal(addPanelOf(e.state).tab, "components", "wraps around");

    unmountAll();
    const none = setup([], false);
    actRun(none.e, "insert.open");
    await act(async () => {});
    assert.equal(none.r.all('[role="tab"]').length, 0);
    assert.ok(none.r.get('[data-slot="AddPanel"]'));

    unmountAll();
    const off = createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), tailwindKit(), editorKit(), blockSourceFacet.of({ blocks: () => BLOCKS, enabled: false })] });
    const r3 = render(withEditor(off, <AddPanel />));
    open.push(r3);
    actRun(off, "insert.open", { tab: "blocks" });
    await act(async () => {});
    assert.equal(r3.all('[role="tab"]').length, 0);
    assert.ok(r3.all("[data-add-blocks]").length === 0, "Components shows alone");
  });

  it("AI button: right of the tabs when the host provides one (alone in a row when there are no tabs); none by default", async () => {
    const Ai = () => <button type="button">Ask AI</button>;
    const { e, r } = setup([addPanelAiFacet.of(Ai)]);
    actRun(e, "insert.open");
    await act(async () => {});
    const slot = r.get("[data-add-ai]");
    assert.equal(slot.textContent, "Ask AI");
    assert.equal(slot.previousElementSibling, r.all('[role="tab"]').at(-1), "after the last tab");
    unmountAll();
    const solo = setup([addPanelAiFacet.of(Ai)], false);
    actRun(solo.e, "insert.open");
    await act(async () => {});
    assert.equal(solo.r.get("[data-add-ai]").textContent, "Ask AI");
    unmountAll();
    const plain = setup();
    actRun(plain.e, "insert.open");
    await act(async () => {});
    assert.equal(plain.r.all("[data-add-ai]").length, 0);
  });

  it("URL params (host hook): panel / cat / sub / sty / q with the host's prefix; opening and navigating push, search edits replace, Back steps back; no binding = URL untouched", async () => {
    history.replaceState(null, "", "/?other=1");
    const none = setup();
    actRun(none.e, "insert.open", { tab: "blocks", category: "hero" });
    await act(async () => {});
    assert.equal(location.search, "?other=1", "the editor is URL-free by default");
    unmountAll();

    const { e } = setup([addPanelUrlFacet.of(locationBinding({ prefix: "ed-" }))]);
    const length = history.length;
    actRun(e, "insert.open", { tab: "blocks" });
    await act(async () => {});
    assert.equal(location.search, "?other=1&ed-panel=blocks");
    actRun(e, "insert.set", { category: "hero" });
    await act(async () => {});
    assert.equal(location.search, "?other=1&ed-panel=blocks&ed-cat=hero");
    actRun(e, "insert.set", { query: "bold" });
    await act(async () => {});
    assert.equal(location.search, "?other=1&ed-panel=blocks&ed-cat=hero&ed-q=bold");
    assert.equal(history.length, length + 2, "two pushes (open, category); the search edit replaced");
    actRun(e, "insert.close");
    await act(async () => {});
    assert.equal(location.search, "?other=1", "closed: no panel params");
  });

  it("URL params: a URL with the params opens the panel on mount; a URL change from outside (Back) is applied", async () => {
    history.replaceState(null, "", "/?panel=blocks&cat=faq&q=hi");
    const { e } = setup([addPanelUrlFacet.of(locationBinding())]);
    await act(async () => {});
    assert.deepEqual([addPanelOf(e.state).open, addPanelOf(e.state).tab, addPanelOf(e.state).category, addPanelOf(e.state).query], [true, "blocks", "faq", "hi"]);
    history.replaceState(null, "", "/");
    await act(async () => void window.dispatchEvent(new PopStateEvent("popstate")));
    assert.equal(addPanelOf(e.state).open, false);
    assert.equal(location.search, "", "applying the URL does not write it back");
  });

  it("a custom binding sees pushes and replaces in order", async () => {
    const calls: string[] = [];
    const binding: AddPanelUrlBinding = { read: () => null, write: (s, h) => void calls.push(`${h}:${s.open ? s.tab : "closed"}:${s.query}`) };
    const { e } = setup([addPanelUrlFacet.of(binding)]);
    actRun(e, "insert.open", { tab: "blocks" });
    await act(async () => {});
    actRun(e, "insert.set", { query: "ab" });
    await act(async () => {});
    assert.deepEqual(calls, ["push:blocks:", "replace:blocks:ab"]);
  });

  it("Blocks home: every category in the order has a wireframe on its card; others show their name", async () => {
    for (const id of [...CATEGORY_ORDER, "my-blocks"]) assert.ok(CATEGORY_WIREFRAMES[id], `wireframe for ${id}`);
    const { r } = setup([], BLOCKS, { tab: "blocks" });
    await act(async () => {});
    // The wireframe is the card's first child; the footer carries its own chevron svg.
    const wireframe = (id: string) => r.get(`[data-category-card="${id}"]`).firstElementChild!.querySelector("svg") !== null;
    assert.equal(wireframe("hero"), true);
    assert.equal(wireframe("my-blocks"), true);
    assert.equal(wireframe("weird"), false);
    assert.equal(r.get('[data-category-card="weird"]').textContent?.includes("Weird"), true);
  });

  it("Add Section dialog: rail (All, My blocks, categories) + search; a click inserts at the end of the page and closes; 'Custom' on saved", async () => {
    const { e, r } = setup();
    actRun(e, "insert.sectionDialog");
    await act(async () => {});
    const rail = () => r.all("[data-section-category]").map((c) => c.getAttribute("data-section-category"));
    assert.deepEqual(rail(), ["all", "my-blocks", "hero", "faq", "weird"]);
    const dialog = document.querySelector<HTMLElement>("[data-section-dialog]")!;
    assert.ok(dialog.closest('[role="dialog"]'));
    assert.equal(r.all("[data-section-block]").length, 4);
    assert.match(r.get('[data-section-block="my-one"]').textContent!, /Custom/);
    assert.equal(r.get("[data-section-block] iframe, [data-section-block] [data-block-preview]").getAttribute("data-block-preview") !== null, true);
    await r.click(r.get('[data-section-category="faq"]'));
    assert.deepEqual(r.all("[data-section-block]").map((b) => b.getAttribute("data-section-block")), ["faq-a"]);
    await r.type(r.get('input[aria-label="Search blocks..."]'), "zzz");
    assert.equal(r.all("[data-section-block]").length, 0);
    assert.ok(r.get("[data-section-empty]"));
    await r.type(r.get('input[aria-label="Search blocks..."]'), "");
    await r.click(r.get('[data-section-category="all"]'));
    await r.click(r.get('[data-section-block="hero-a"]'));
    assert.match(e.text(), /<\/h1>\n<section>hero-a<\/section>|<section>hero-a<\/section>\n<\/main>/);
    assert.equal(addPanelOf(e.state).dialog, false);
    // The dialog unmounts after its exit transition. Compare a boolean: a failing DOM-node equality makes node:test diff the whole happy-dom tree and hang.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 400));
    });
    assert.equal(document.querySelector("[data-section-dialog]") === null, true);
    assert.equal(e.state.selection.primary?.tag, "section");
  });
});
