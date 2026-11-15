import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { blockSourceFacet, type BlockItem } from "@pagehub/engine/host";
import { editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { addPanelOf } from "../src/features/add/addPanelState.ts";
import { dragSessionOf } from "../src/features/dnd/dragSession.ts";
import { handleDragOf } from "../src/features/canvas/handleDrag.ts";
import { EmptyHint } from "../src/features/canvas/EmptyHint.tsx";
import { pageRoot, pageSections } from "../src/features/canvas/pageSections.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { fireIn, frameDoc, mountCanvas, setRect, wait } from "./canvasHarness.tsx";
import { actRun, render, withEditor, type Rendered } from "./harness.tsx";

const PAGE = `<main class="p-4">\n  {% render 'header' %}\n  <section class="a"><h2>A</h2></section>\n  <section class="b"><h2>B</h2></section>\n  <section class="c"><h2>C</h2></section>\n  <footer class="f">F</footer>\n</main>\n`;
const HEADER = `<header class="p-2"><a href="/">Home</a></header>\n`;
const BLOCKS: BlockItem[] = [{ slug: "faq-one", name: "faq one", category: "faq", source: `<section>faq-one</section>` }];

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  resetOverlaysForTests();
});

const editor = (src = PAGE, role?: string): TestEditor =>
  createTestEditor({ files: { "index.liquid": src, "partials/header.liquid": HEADER }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), blockSourceFacet.of({ blocks: () => BLOCKS })], ...(role ? { role } : {}) } as never);

/** Mounts the canvas with three 100px sections stacked from y=0 (boundaries at 0, 100, 200, 300). */
async function setup(e = editor()) {
  const m = await mountCanvas(e);
  open.push(m.r);
  setRect(m.r.get("[data-canvas-frame]"), { left: 0, top: 0, width: 1000, height: 800 });
  setRect(m.r.get("[data-canvas-host]"), { left: 0, top: 0, width: 1000, height: 800 });
  m.doc.querySelectorAll("section").forEach((s, i) => setRect(s, { left: 0, top: i * 100, width: 800, height: 100 }));
  const point = (x: number, y: number) => fireIn(m.doc.body, "mousemove", { clientX: x, clientY: y });
  const plus = () => m.r.container.querySelector<HTMLButtonElement>("[data-section-plus]");
  /** Whether a "+" shows (a boolean: asserting on a DOM node makes a failure message huge). */
  const shows = () => !!plus();
  return { ...m, point, plus, shows };
}

describe("+ lines between sections", () => {
  it("the sections are the page root's element children, without header / footer chrome; a lone <article> wrapper holds them", () => {
    const e = editor();
    const s = pageSections(pageRoot(e as never, "index.liquid")!);
    assert.equal(s.parent.tag, "main");
    assert.deepEqual(s.sections.map((h) => h.classes()[0]), ["a", "b", "c"]);
    const w = editor(`<main>\n  {% render 'header' %}\n  <article>\n    <section>A</section>\n    <section>B</section>\n  </article>\n</main>\n`);
    const ws = pageSections(pageRoot(w as never, "index.liquid")!);
    assert.equal(ws.parent.tag, "article");
    assert.deepEqual(ws.sections.map((h) => h.text()), ["<section>A</section>", "<section>B</section>"]);
    assert.ok(w.run("element.insert", { snippet: "<section>N</section>", to: { after: ws.sections[0] } }), "a section can be added between them");
    const two = editor(`<main>\n  <article><section>A</section></article>\n  <div>x</div>\n</main>\n`);
    assert.equal(pageSections(pageRoot(two as never, "index.liquid")!).parent.tag, "main", "an article beside other content is one section");
  });

  it("near a boundary: a line with a round + (tooltip, no title); away from one: nothing", async () => {
    const { r, point, plus, shows } = await setup();
    assert.equal(shows(), false, "nothing until the pointer comes near");
    await point(400, 50);
    assert.equal(shows(), false, "mid-section");
    await point(400, 104);
    const line = r.get("[data-section-line]") as HTMLElement;
    assert.equal(line.getAttribute("data-section-line"), "below");
    assert.deepEqual([line.style.left, line.style.top, line.style.width], ["0px", "100px", "800px"]);
    assert.equal(plus()!.getAttribute("data-tooltip-content"), "Add section");
    assert.equal(plus()!.hasAttribute("title"), false);
    await point(400, 3);
    assert.equal(plus()!.getAttribute("data-section-plus"), "above", "above the first");
    await point(400, 298);
    assert.equal(plus()!.getAttribute("data-section-plus"), "below", "below the last");
    assert.equal((r.get("[data-section-line]") as HTMLElement).style.top, "300px");
    await point(900, 100);
    assert.equal(shows(), false, "outside the sections' width");
  });

  it("clicking + opens the Add section dialog at that spot; the pick lands there", async () => {
    const { r, e, point, plus } = await setup();
    await point(400, 198);
    await r.click(plus()!);
    const st = addPanelOf(e.state);
    assert.equal(st.dialog, true);
    assert.equal(st.pending?.position, "below");
    assert.equal(st.pending?.anchor, e.find("index.liquid", "section")[1]);
    await wait(10);
    assert.ok(document.querySelector("[data-section-dialog]"), "the dialog is open");
    await r.click(r.get('[data-section-block="faq-one"]'));
    await wait(10);
    assert.match(e.text(), /<h2>B<\/h2><\/section>\n {2}<section>faq-one<\/section>\n {2}<section class="c">/);
    assert.equal(addPanelOf(e.state).dialog, false);

    // the canvas re-rendered: lay its four sections out again
    frameDoc(r).querySelectorAll("section").forEach((el, i) => setRect(el, { left: 0, top: i * 100, width: 800, height: 100 }));
    await point(400, 2);
    await r.click(plus()!);
    assert.equal(addPanelOf(e.state).pending?.position, "above");
    assert.equal(addPanelOf(e.state).pending?.anchor, e.find("index.liquid", "section")[0]);
  });

  it("hidden during a drag, a handle drag and inline text editing", async () => {
    const { e, doc, point, shows } = await setup();
    await point(400, 100);
    assert.ok(shows());
    await act(async () => void dragSessionOf(e).start({ kind: "existing", handles: [e.get("h2")] }, 0, 0, false));
    assert.equal(shows(), false, "a drag");
    await act(async () => void dragSessionOf(e).end(false));
    assert.ok(shows());
    await act(async () => void handleDragOf(e).set(true));
    assert.equal(shows(), false, "a handle drag");
    await act(async () => void handleDragOf(e).set(false));
    assert.ok(shows());
    await fireIn(doc.querySelector("h2")!, "mousedown");
    actRun(e, "richtext.edit");
    await point(400, 100);
    assert.equal(shows(), false, "inline text editing");
    actRun(e, "richtext.exit");
    await point(400, 100);
    assert.ok(shows());
  });

  it("hidden in preview", async () => {
    const { e, r, point, shows } = await setup();
    await point(400, 100);
    assert.ok(shows());
    actRun(e, "preview.toggle");
    assert.equal(!!r.container.querySelector("[data-section-plus]"), false);
    assert.equal(shows(), false);
  });

  it("hidden in content mode (client, viewer)", async () => {
    for (const role of ["client", "viewer"]) {
      const { point, shows } = await setup(editor(PAGE, role));
      await point(400, 100);
      assert.equal(shows(), false, role);
    }
  });

  it("an empty page: one Add section button that opens the dialog for the end of the page", async () => {
    const { r, e, doc } = await setup(editor(`<main class="p-4">\n  {% render 'header' %}\n</main>\n`));
    setRect(doc.querySelector("main")!, { left: 0, top: 40, width: 800, height: 400 });
    await fireIn(doc.body, "mousemove", { clientX: 1, clientY: 1 });
    const btn = r.get('[data-section-plus="empty"]');
    assert.match(btn.textContent!, /Add section/);
    await r.click(btn);
    assert.equal(addPanelOf(e.state).dialog, true);
    assert.equal(addPanelOf(e.state).pending, null);
  });

  it("the empty-page hint on the page's section container opens the Add section dialog", async () => {
    const e = editor(`<main></main>\n`);
    const r = render(withEditor(e, <EmptyHint handle={e.get("main")} selected={false} />));
    open.push(r);
    await r.click(r.get("[data-empty-hint]"));
    assert.equal(addPanelOf(e.state).dialog, true);
    assert.equal(addPanelOf(e.state).open, false, "not the Blocks panel");
  });
});
