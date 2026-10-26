import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { menusFacet, type Extension } from "@pagehub/engine";
import { blockProvenanceFacet, htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { blockSourceFacet, type BlockItem, type BlockSource } from "@pagehub/engine/host";
import { AddPanel } from "../src/features/add/AddPanel.tsx";
import { mountCanvas, setRect } from "./canvasHarness.tsx";
import { actRun, render, withEditor, type Rendered } from "./harness.tsx";

const PAGE = `<main>\n  <h1>A</h1>\n  <p>B</p>\n</main>\n`;

const block = (slug: string, category: string, extra: Partial<BlockItem> = {}): BlockItem => ({ slug, name: slug.replace(/-/g, " "), category, source: `<section>${slug}</section>`, ...extra });
const BLOCKS: BlockItem[] = [
  block("faq-one", "faq"),
  ...Array.from({ length: 8 }, (_, i) => block(`hero-${i}`, "hero", { subcategory: i % 2 ? "split" : "centered", styles: i < 3 ? ["bold"] : ["calm"] })),
  block("features-grid", "features", { styles: ["calm"] }),
  block("zany", "weird"),
  block("my-hero", "hero", { saved: true }),
];

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  localStorage.clear();
});

function editor(source: Partial<BlockSource> = {}, extra: Extension[] = [], src = PAGE): TestEditor {
  return createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), blockSourceFacet.of({ blocks: () => BLOCKS, ...source }), ...extra] });
}

async function mount(e: TestEditor, patch: Record<string, unknown> = {}): Promise<Rendered> {
  actRun(e, "insert.open", { tab: "blocks", ...patch });
  const r = render(withEditor(e, <AddPanel />));
  open.push(r);
  await act(async () => {});
  return r;
}

const cards = (r: Rendered) => r.all("[data-block-card]").map((c) => c.getAttribute("data-block-card"));
const catCards = (r: Rendered) => r.all("[data-category-card]").map((c) => c.getAttribute("data-category-card"));

/** IntersectionObserver stub: `fire()` reports every observed sentinel as intersecting. */
function stubObserver() {
  const live = new Set<{ cb: IntersectionObserverCallback }>();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    entry: { cb: IntersectionObserverCallback };
    constructor(cb: IntersectionObserverCallback) {
      this.entry = { cb };
    }
    observe() {
      live.add(this.entry);
    }
    disconnect() {
      live.delete(this.entry);
    }
  };
  return { fire: () => act(async () => void [...live].forEach((o) => o.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))), restore: () => delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver };
}

describe("add panel: blocks home", () => {
  it("2-column category cards: My blocks first, then today's order, then the rest; 'N blocks · M types'", async () => {
    const r = await mount(editor());
    assert.deepEqual(catCards(r), ["my-blocks", "hero", "features", "faq", "weird"]);
    assert.ok(r.get("[data-category-card]").parentElement!.className.includes("grid-cols-2"));
    assert.equal(r.get('[data-category-card="hero"] [data-category-count]').textContent, "8 blocks · 2 types");
    assert.equal(r.get('[data-category-card="faq"] [data-category-count]').textContent, "1 block");
  });

  it("the site style auto-applies (marked); cards read 'X of N' and dim at 0; clearing stops the auto-apply for the session", async () => {
    const e = editor({ siteStyle: "bold" });
    const r = await mount(e);
    assert.ok(r.get('[data-filter="Style"] [data-filter-auto]'));
    assert.equal(r.get('[data-category-card="hero"] [data-category-count]').textContent, "3 of 8 blocks · 2 types");
    assert.equal(r.get('[data-category-card="faq"]').getAttribute("data-dimmed"), "");
    await r.click(r.get('[data-filter="Style"] [data-filter-clear]'));
    assert.equal(r.get('[data-category-card="hero"] [data-category-count]').textContent, "8 blocks · 2 types");
    actRun(e, "insert.toggle");
    actRun(e, "insert.toggle");
    assert.equal(document.querySelector('[data-filter="Style"] [data-filter-value]'), null, "still cleared on reopen");
  });

  it("an async source shows skeleton cards the size of the real ones, then the categories", async () => {
    let resolve!: (b: readonly BlockItem[]) => void;
    const r = await mount(editor({ blocks: () => new Promise((res) => (resolve = res)) }));
    assert.equal(r.all("[data-skeleton]").length, 6);
    assert.ok(r.get("[data-skeleton]").className.includes("h-[9.5rem]"));
    await act(async () => resolve(BLOCKS));
    assert.equal(r.all("[data-skeleton]").length, 0);
    assert.ok(r.get('[data-category-card="hero"]'));
  });

  it("search from 2 characters: results grouped by category '(n)', 6 at a time with more on scroll (fixed); 'No blocks found for \"q\"'", async () => {
    const io = stubObserver();
    try {
      const e = editor();
      const r = await mount(e);
      await r.type(r.get("[data-add-search]"), "h");
      assert.ok(r.all("[data-category-card]").length > 0, "1 character: still the home grid");
      await r.type(r.get("[data-add-search]"), "hero");
      assert.equal(r.all("[data-block-card]").length, 6);
      assert.match(r.get('[data-result-group="hero"]').textContent!, /^Hero \(8\)/);
      await io.fire();
      assert.equal(r.all("[data-block-card]").length, 9);
      assert.ok(r.get('[data-result-group="my-blocks"]'));
      await r.type(r.get("[data-add-search]"), "nothing here");
      assert.equal(r.get('[data-block-results="none"]').textContent, `No blocks found for "nothing here"`);
    } finally {
      io.restore();
    }
  });
});

describe("add panel: category detail", () => {
  it("back arrow, name + total; Style and Filter dropdowns close each other; 6 cards per page with more on scroll; prev / next categories", async () => {
    const io = stubObserver();
    try {
      const e = editor();
      const r = await mount(e);
      await r.click(r.get('[data-category-card="hero"]'));
      assert.match(r.get('[data-category-detail="hero"]').textContent!, /Hero8/);
      assert.equal(cards(r).length, 6);
      await io.fire();
      assert.equal(cards(r).length, 8);
      await r.click(r.get('[data-filter="Style"] [data-filter-trigger]'));
      assert.ok(r.get('[data-filter-item="bold"]'));
      await r.click(r.get('[data-filter="Filter"] [data-filter-trigger]'));
      assert.equal(document.querySelector('[data-filter-item="bold"]'), null, "opening Filter closed Style");
      await r.click(r.get('[data-filter-item="split"]'));
      assert.deepEqual(cards(r), ["hero-1", "hero-3", "hero-5", "hero-7"]);
      assert.equal(r.get("[data-category-prev]").getAttribute("data-category-prev"), "my-blocks");
      await r.click(r.get("[data-category-next]"));
      assert.ok(r.get('[data-category-detail="features"]'));
      await r.click(r.get("[data-add-back]"));
      assert.ok(r.get('[data-category-card="hero"]'));
    } finally {
      io.restore();
    }
  });

  it("the site style applies in a category that has it (marked auto-applied); 'No blocks in this category.' when a filter leaves none", async () => {
    const e = editor({ siteStyle: "bold" });
    const r = await mount(e, { category: "hero" });
    assert.deepEqual(cards(r), ["hero-0", "hero-1", "hero-2"]);
    assert.ok(r.get('[data-filter="Style"] [data-filter-auto]'));
    await r.click(r.get('[data-filter="Filter"] [data-filter-trigger]'));
    actRun(e, "insert.set", { sub: "missing" });
    assert.ok(r.container.textContent!.includes("No blocks in this category."));
  });

  it("block card: preview (sandboxed, 0.35) over its name; 'custom' on the author's own; insert hint tooltip", async () => {
    const e = editor({ blocks: () => [block("b", "hero", { preview: "<p>hi</p>" }), block("mine", "hero", { saved: true })] });
    const r = await mount(e, { category: "hero" });
    const frame = r.get('[data-block-card="b"] iframe');
    assert.equal(frame.getAttribute("sandbox"), "");
    assert.equal(frame.style.transform, "scale(0.35)");
    assert.match(r.get('[data-block-card="b"]').getAttribute("data-tooltip-html")!, /Double-click/);
    await r.click(r.get("[data-category-prev]"));
    assert.match(r.get('[data-block-card="mine"]').textContent!, /custom/);
  });
});

describe("add panel: block insert", () => {
  it("double-click a block → at the end of the page (the selection's page), one undo step; with provenance the slug is stamped", async () => {
    const e = editor({}, [blockProvenanceFacet.of(true)]);
    const r = await mount(e, { category: "faq" });
    await r.fire(r.get('[data-block-card="faq-one"]'), "dblclick");
    assert.equal(e.text(), `<main>\n  <h1>A</h1>\n  <p>B</p>\n  <section data-edit-block="faq-one">faq-one</section>\n</main>\n`);
    assert.ok(e.undo());
    assert.equal(e.text(), PAGE);
  });

  it("'Add block above / below' (canvas context menu) opens Blocks; the next double-click lands there once", async () => {
    const e = editor();
    assert.ok((e.state.facet(menusFacet)["canvas/context"] ?? []).some((m) => m.command === "insert.blockAbove"));
    e.select(e.get("p"));
    actRun(e, "insert.blockAbove");
    assert.equal(addPanelOf(e.state).tab, "blocks");
    const r = render(withEditor(e, <AddPanel />));
    open.push(r);
    actRun(e, "insert.set", { category: "faq" });
    await act(async () => {});
    await r.fire(r.get('[data-block-card="faq-one"]'), "dblclick");
    assert.equal(e.text(), `<main>\n  <h1>A</h1>\n  <section>faq-one</section>\n  <p>B</p>\n</main>\n`);
    assert.equal(addPanelOf(e.state).pending, null);
    e.select(e.get("h1"));
    actRun(e, "insert.blockBelow");
    await r.fire(r.get('[data-block-card="faq-one"]'), "dblclick");
    assert.match(e.text(), /<h1>A<\/h1>\n  <section>faq-one<\/section>\n  <section>faq-one<\/section>/);
  });

  it("drag a block card onto the canvas → inserted where it lands", async () => {
    const e = editor({}, [], `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n</main>\n`);
    const { r, doc } = await mountCanvas(e);
    open.push(r);
    setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
    setRect(doc.querySelector("main")!, { left: 0, top: 0, width: 800, height: 100 });
    setRect(doc.querySelector("h1")!, { left: 0, top: 0, width: 800, height: 40 });
    setRect(doc.querySelector("p")!, { left: 0, top: 50, width: 800, height: 40 });
    const p = await mount(e, { category: "faq" });
    const card = p.get('[data-add-blocks] [data-block-card="faq-one"], [data-category-detail] [data-block-card="faq-one"]');
    await act(async () => void card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 1100, clientY: 10 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 400, clientY: 85 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 400, clientY: 85 })));
    assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n  <section>faq-one</section>\n</main>\n`);
  });
});

describe("add panel: quick look", () => {
  it("Space over a hovered card opens it (0.65, min(900px, 85vw)); hovering another switches; Space, Esc or a press on a card closes; the hint shows until first use", async () => {
    const e = editor({ blocks: () => [block("a", "hero", { preview: "<p>a</p>" }), block("b", "hero", { preview: "<p>b</p>" })] });
    const r = await mount(e, { category: "hero" });
    assert.ok(r.get("[data-quick-look-hint]"));
    await r.fire(r.get('[data-block-card="a"]'), "mouseover");
    act(() => void e.press("space"));
    assert.ok(r.get('[data-quick-look="a"]'));
    assert.ok(r.get('[data-quick-look="a"] .w-\\[min\\(900px\\,85vw\\)\\]'));
    assert.equal(r.get('[data-quick-look="a"] iframe').style.transform, "scale(0.65)");
    assert.equal(document.querySelector("[data-quick-look-hint]"), null);
    await r.fire(r.get('[data-block-card="b"]'), "mouseover");
    assert.ok(r.get('[data-quick-look="b"]'));
    act(() => void e.press("space"));
    assert.equal(document.querySelector("[data-quick-look]"), null);
    act(() => void e.press("space"));
    act(() => void e.press("escape"));
    assert.equal(document.querySelector("[data-quick-look]"), null);
    act(() => void e.press("space"));
    await act(async () => void r.get('[data-block-card="a"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })));
    await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", {})));
    assert.equal(document.querySelector("[data-quick-look]"), null);
    assert.equal(localStorage.getItem("pagehub-editor:quick-look-used"), "true");
  });
});

describe("add panel: blocks listed without their source", () => {
  const listed = (slug: string, extra: Partial<BlockItem> = {}): BlockItem => ({ slug, name: slug, category: "faq", ...extra });

  it("a card asks the host for its detail only when it nears the viewport, shows a skeleton until then, and keeps the answer", async () => {
    const asked: string[] = [];
    const io = stubObserver();
    try {
      const e = editor({ blocks: () => [listed("a"), listed("b")], detail: async (slug) => (asked.push(slug), { source: `<section>${slug}</section>`, preview: `<p>${slug}</p>` }) });
      const r = await mount(e, { category: "faq" });
      assert.deepEqual(asked, [], "nothing asked while the cards are off screen");
      assert.ok(r.get('[data-block-card="a"] [data-skeleton]'));
      await io.fire();
      assert.deepEqual([...asked].sort(), ["a", "b"]);
      assert.equal(r.get('[data-block-card="a"] iframe').getAttribute("srcdoc"), "<p>a</p>");
      await io.fire();
      assert.equal(asked.length, 2, "asked once per block");
    } finally {
      io.restore();
    }
  });

  it("double-click inserts a block whose source hasn't arrived: the host is asked, then it lands", async () => {
    const e = editor({ blocks: () => [listed("a")], detail: async () => ({ source: "<section>from detail</section>" }) });
    const io = stubObserver(); // never fires: the card is still off screen
    try {
      const r = await mount(e, { category: "faq" });
      e.select(e.get("h1"));
      await act(async () => void r.get('[data-block-card="a"]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
      await act(async () => {});
      assert.match(e.text(), /<section>from detail<\/section>/);
    } finally {
      io.restore();
    }
  });

  for (const moveAfter of [true, false]) it(`a press on a card whose source hasn't arrived still drags: the drop lands (${moveAfter ? "moving on after it arrived" : "released after it arrived, no further move"})`, async () => {
    const e = editor({ blocks: () => [listed("a")], detail: async () => ({ source: "<section>from detail</section>" }) }, [], `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n</main>\n`);
    const io = stubObserver();
    try {
      const { r, doc } = await mountCanvas(e);
      open.push(r);
      setRect(r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
      setRect(r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
      setRect(doc.querySelector("main")!, { left: 0, top: 0, width: 800, height: 100 });
      setRect(doc.querySelector("h1")!, { left: 0, top: 0, width: 800, height: 40 });
      setRect(doc.querySelector("p")!, { left: 0, top: 50, width: 800, height: 40 });
      const p = await mount(e, { category: "faq" });
      const card = p.get('[data-block-card="a"]');
      assert.ok(p.get('[data-block-card="a"] [data-skeleton]'), "still loading at the press");
      await act(async () => void card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 1100, clientY: 10 })));
      await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 600, clientY: 10 })));
      await io.fire();
      await act(async () => {});
      if (moveAfter) await act(async () => void window.dispatchEvent(new PointerEvent("pointermove", { buttons: 1, clientX: 400, clientY: 85 })));
      await act(async () => void window.dispatchEvent(new PointerEvent("pointerup", { clientX: 400, clientY: 85 })));
      assert.equal(e.text(), `<main class="p-4">\n  <h1>A</h1>\n  <p>B</p>\n  <section>from detail</section>\n</main>\n`);
    } finally {
      io.restore();
    }
  });

  it("a block the host can't detail stays on its name and inserts nothing", async () => {
    const e = editor({ blocks: () => [listed("a")], detail: async () => Promise.reject(new Error("nope")) });
    const r = await mount(e, { category: "faq" });
    await act(async () => {});
    assert.ok(r.get('[data-block-card="a"] [data-block-preview="none"]'));
    const before = e.text();
    await act(async () => void r.get('[data-block-card="a"]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await act(async () => {});
    assert.equal(e.text(), before);
  });
});
