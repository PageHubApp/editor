import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, type Store } from "../src/state/store.ts";
import type { NodeHandle } from "../src/state/handles.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { history } from "../src/history/history.ts";
import { DEFAULT_LAYOUT_CLASSES as C } from "../src/kits/html/dnd/layout.ts";
import { planBeside } from "../src/kits/html/dnd/beside.ts";

const P = "index.liquid";
const open = (text: string, files: Record<string, string> = {}) => createStore({ files: { [P]: text, ...files }, extensions: [htmlKit(), history()] });
const get = (s: Store, sel: string, i = 0) => s.find(P, sel)[i]!;
const text = (s: Store) => s.state.files.get(P)!;

/** Run a command, assert the exact output, one transaction, and that one undo restores the input. */
function drop(s: Store, id: string, args: unknown, expected: string | false): NodeHandle | null {
  const before = text(s);
  let n = 0;
  const off = s.subscribe((x) => x.files, () => n++);
  const ok = s.run(id, args);
  off();
  if (expected === false) {
    assert.equal(ok, false, `${id} should refuse`);
    assert.equal(text(s), before);
    return null;
  }
  assert.equal(ok, true, `${id} should run`);
  assert.equal(text(s), expected);
  assert.equal(n, 1, "one transaction");
  const selected = s.state.selection.primary;
  s.undo();
  assert.equal(text(s), before, "one undo restores the source");
  s.redo();
  return selected;
}

const COL = `<main>
  <div class="flex flex-col">
    <h2>A</h2>
    <p>B</p>
    <p>C</p>
  </div>
</main>
`;

test("element.move: reorder within a column is one transaction; the moved node stays selected", () => {
  const s = open(COL);
  const sel = drop(s, "element.move", { nodes: [get(s, "p", 1)], to: { before: get(s, "h2") } }, `<main>\n  <div class="flex flex-col">\n    <p>C</p>\n    <h2>A</h2>\n    <p>B</p>\n  </div>\n</main>\n`);
  assert.equal(sel?.text(), "<p>C</p>");
});

test("element.move: Shift-drop copies to the drop index and selects the last copy", () => {
  const s = open(`<div>\n  <p data-edit-id="x1">A</p>\n  <p>B</p>\n</div>\n`);
  const sel = drop(s, "element.move", { nodes: [get(s, "p")], to: { after: get(s, "p", 1) }, copy: true }, `<div>\n  <p data-edit-id="x1">A</p>\n  <p>B</p>\n  <p>A</p>\n</div>\n`);
  assert.equal(sel?.text(), "<p>A</p>");
});

test("element.move: copying several nodes is one transaction", () => {
  const s = open(`<div>\n  <p>A</p>\n  <p>B</p>\n  <hr>\n</div>\n`);
  drop(s, "element.move", { nodes: [get(s, "p"), get(s, "p", 1)], to: { after: get(s, "hr") }, copy: true }, `<div>\n  <p>A</p>\n  <p>B</p>\n  <hr>\n  <p>A</p>\n  <p>B</p>\n</div>\n`);
});

test("drop rules: a page only at the top level, a section only into a page / header / footer, no form in a form, not into itself, void or raw", () => {
  const s = open(`<main>\n  <section><p>x</p></section>\n  <div><form><input></form></div>\n  <form id="f"></form>\n</main>\n<script>a</script>\n`);
  const sec = get(s, "section");
  drop(s, "element.move", { nodes: [sec], to: { append: get(s, "div") } }, false);
  drop(s, "element.move", { nodes: [get(s, "main")], to: { append: get(s, "div") } }, false);
  drop(s, "element.move", { nodes: [get(s, "form#f")], to: { append: get(s, "form") } }, false);
  drop(s, "element.move", { nodes: [get(s, "div")], to: { append: get(s, "form") } }, false);
  drop(s, "element.move", { nodes: [get(s, "p")], to: { append: get(s, "input") } }, false);
  drop(s, "element.move", { nodes: [get(s, "p")], to: { append: get(s, "script") } }, false);
  drop(s, "element.move", { nodes: [get(s, "p")], to: { after: get(s, "p") } }, false);
});

test("drop rules: data-edit-lock drag / move-out / drop-in refuse; Liquid blocks with branches take no direct children", () => {
  const s = open(`<div data-edit-lock="move-out">\n  <p>A</p>\n</div>\n<div data-edit-lock="drop-in"></div>\n<p data-edit-lock="drag">D</p>\n<div id="ok"></div>\n{% if x %}<b>y</b>{% else %}<i>z</i>{% endif %}\n`);
  drop(s, "element.move", { nodes: [get(s, "p")], to: { append: get(s, "#ok") } }, false);
  drop(s, "element.move", { nodes: [get(s, "#ok")], to: { append: get(s, "div", 1) } }, false);
  drop(s, "element.move", { nodes: [get(s, "p", 1)], to: { append: get(s, "#ok") } }, false);
  const block = s.find(P, "b")[0]!.parent()!;
  assert.equal(block.kind, "liquid-block");
});

test("a section dropped at the top level beside the page goes into the page (start or end)", () => {
  const s = open(`<header>H</header>\n<main>\n  <section>1</section>\n</main>\n<div>\n  <section>2</section>\n</div>\n`);
  drop(s, "element.move", { nodes: [get(s, "section", 1)], to: { before: get(s, "main") } }, `<header>H</header>\n<main>\n  <section>2</section>\n  <section>1</section>\n</main>\n<div>\n</div>\n`);
});

test("element.move: a move out of a beside Item removes the empty Item and unwraps the Row left with one Item", () => {
  const src = `<div class="flex flex-col">\n  <div class="${C.row}">\n    <div class="${C.item}">\n      <p>A</p>\n    </div>\n    <div class="${C.item}">\n      <p>B</p>\n    </div>\n  </div>\n  <h2>T</h2>\n</div>\n`;
  const s = open(src);
  drop(s, "element.move", { nodes: [get(s, "p", 1)], to: { after: get(s, "h2") } }, `<div class="flex flex-col">\n  <p>A</p>\n  <h2>T</h2>\n  <p>B</p>\n</div>\n`);
});

test("alignment on drop (same parent): flex column → self-* on the node; flex row main axis → justify-* on the parent; block parent → Align wrapper", () => {
  const s = open(COL);
  drop(s, "element.move", { nodes: [get(s, "p")], to: { after: get(s, "h2") }, align: { zone: "end", axis: "horizontal" } }, COL.replace("<p>B</p>", `<p class="self-end">B</p>`));
  const r = open(`<div class="flex flex-row justify-start">\n  <a>1</a>\n  <a>2</a>\n</div>\n`);
  drop(r, "layout.alignOnDrop", { at: get(r, "a"), intent: { zone: "center", axis: "horizontal" } }, `<div class="flex flex-row justify-center">\n  <a>1</a>\n  <a>2</a>\n</div>\n`);
  const b = open(`<div>\n  <p>1</p>\n</div>\n`);
  drop(b, "layout.alignOnDrop", { at: get(b, "p"), intent: { zone: "end", axis: "horizontal" } }, `<div>\n  <div class="flex w-full justify-end">\n    <p>1</p>\n  </div>\n</div>\n`);
  const w = open(`<div>\n  <div class="flex w-full justify-end">\n    <p>1</p>\n  </div>\n</div>\n`);
  drop(w, "layout.alignOnDrop", { at: get(w, "p"), intent: { zone: "start", axis: "horizontal" } }, `<div>\n  <div class="flex w-full justify-start">\n    <p>1</p>\n  </div>\n</div>\n`);
});

test("alignment skips: centre when the parent has items-center; section / page parents; a move-out locked parent", () => {
  const c = open(`<div class="items-center">\n  <p>1</p>\n</div>\n`);
  drop(c, "layout.alignOnDrop", { at: get(c, "p"), intent: { zone: "center", axis: "horizontal" } }, false);
  const sec = open(`<section class="flex">\n  <p>1</p>\n</section>\n`);
  drop(sec, "layout.alignOnDrop", { at: get(sec, "p"), intent: { zone: "end", axis: "horizontal" } }, false);
  const l = open(`<div data-edit-lock="move-out">\n  <p>1</p>\n</div>\n`);
  drop(l, "layout.alignOnDrop", { at: get(l, "p"), intent: { zone: "end", axis: "horizontal" } }, false);
});

const STACK = `<div class="flex flex-col">
  <h2>Title</h2>
  <img src="/a.png">
  <p>Copy</p>
</div>
`;

test("layout.dropBeside 'Create split': a Row with two Items; the row is selected", () => {
  const s = open(`<div class="flex flex-col">\n  <div class="card">X</div>\n  <img src="/a.png">\n</div>\n`);
  assert.equal(planBeside(s.state, get(s, "div.card"))?.label, "Create split");
  drop(s, "layout.dropBeside", { nodes: [get(s, "img")], target: get(s, "div.card"), side: "left" },
    `<div class="flex flex-col">\n  <div class="${C.row}">\n    <div class="${C.item}">\n      <img src="/a.png">\n    </div>\n    <div class="${C.item}">\n      <div class="card">X</div>\n    </div>\n  </div>\n</div>\n`);
  assert.equal(s.state.selection.primary?.classes().join(" "), C.row);
});

test("layout.dropBeside 'Split content': the target is promoted to its column stack (flex-nowrap row)", () => {
  const s = open(`<main>\n  <div>\n    ${STACK.trimEnd().replace(/\n/g, "\n    ")}\n    <video src="/v.mp4"></video>\n  </div>\n</main>\n`);
  const h2 = get(s, "h2");
  assert.equal(planBeside(s.state, h2)?.label, "Split content");
  drop(s, "layout.dropBeside", { nodes: [get(s, "video")], target: h2, side: "right" },
    `<main>\n  <div>\n    <div class="${C.promotedRow}">\n      <div class="${C.promotedTargetItem}">\n        <div class="flex flex-col">\n          <h2>Title</h2>\n          <img src="/a.png">\n          <p>Copy</p>\n        </div>\n      </div>\n      <div class="${C.promotedDraggedItem}">\n        <video src="/v.mp4"></video>\n      </div>\n    </div>\n  </div>\n</main>\n`);
});

test("layout.dropBeside 'Insert into row': next to an Item of a simple row → a new Item in that row", () => {
  const s = open(`<div class="${C.row}">\n  <div class="${C.item}">\n    <p>A</p>\n  </div>\n  <div class="${C.item}">\n    <p>B</p>\n  </div>\n</div>\n<h3>N</h3>\n`);
  assert.equal(planBeside(s.state, get(s, "p"))?.label, "Insert into row");
  drop(s, "layout.dropBeside", { nodes: [get(s, "h3")], target: get(s, "p"), side: "right" },
    `<div class="${C.row}">\n  <div class="${C.item}">\n    <p>A</p>\n  </div>\n  <div class="${C.item}">\n    <h3>N</h3>\n  </div>\n  <div class="${C.item}">\n    <p>B</p>\n  </div>\n</div>\n`);
});

test("layout.dropBeside: centred content keeps its alignment (Item side classes, row items-end on the right)", () => {
  const s = open(`<div class="flex flex-col items-center text-center">\n  <div class="items-center text-center">X</div>\n  <p class="mx-auto text-center">Y</p>\n</div>\n`);
  drop(s, "layout.dropBeside", { nodes: [get(s, "p")], target: get(s, "div", 1), side: "right" },
    `<div class="flex flex-col items-center text-center">\n  <div class="${C.row.replace("items-stretch", "items-end")}">\n    <div class="${C.item} ${C.sideAlign.right}">\n      <div class="items-center text-center">X</div>\n    </div>\n    <div class="${C.item} ${C.sideAlign.right}">\n      <p class="mx-auto text-center">Y</p>\n    </div>\n  </div>\n</div>\n`);
});

test("layout.dropBeside onto itself or a descendant is refused", () => {
  const s = open(`<div class="flex flex-col">\n  <div class="w"><p>A</p></div>\n  <p>B</p>\n</div>\n`);
  drop(s, "layout.dropBeside", { nodes: [get(s, "div.w")], target: get(s, "div.w"), side: "left" }, false);
  drop(s, "layout.dropBeside", { nodes: [get(s, "div.w")], target: get(s, "p"), side: "left" }, false);
});

test("element.insert { to, automatic }: the Automatic element morphs by where it lands (section+content, content, card, segment, plain)", () => {
  const s = open(`<main>\n  <section>\n    <div class="x">\n      <p>1</p>\n    </div>\n  </section>\n  <div class="${C.card}">\n    <p>c</p>\n  </div>\n</main>\n`);
  drop(s, "element.insert", { automatic: true, to: { append: get(s, "main") } }, text(s).replace(`  </div>\n</main>`, `  </div>\n  <section class="${C.section}">\n    <div class="${C.content}"></div>\n  </section>\n</main>`));
  const t = open(`<main>\n  <section>\n    <div class="x">\n      <p>1</p>\n    </div>\n  </section>\n</main>\n`);
  drop(t, "element.insert", { automatic: true, to: { append: get(t, "section") } }, text(t).replace(`    </div>\n  </section>`, `    </div>\n    <div class="${C.content}"></div>\n  </section>`));
  drop(t, "element.insert", { automatic: true, to: { after: get(t, "p") } }, text(t).replace(`<p>1</p>`, `<p>1</p>\n      <div class="${C.card}"></div>`));
  const u = open(`<div class="${C.card}">\n  <p>c</p>\n</div>\n<div>\n  <div>\n    <p>z</p>\n  </div>\n</div>\n`);
  drop(u, "element.insert", { automatic: true, to: { after: get(u, "p") } }, text(u).replace(`<p>c</p>`, `<p>c</p>\n  <div class="${C.segment}"></div>`));
  drop(u, "element.insert", { automatic: true, to: { after: get(u, "p", 1) } }, text(u).replace(`<p>z</p>`, `<p>z</p>\n    <div class="${C.plain}"></div>`));
});

test("element.insert { automatic } without a drop point: morphs for where the click insert lands (after the selection)", () => {
  const s = open(`<main>\n  <section>\n    <p>1</p>\n  </section>\n</main>\n`);
  s.select(get(s, "p"));
  drop(s, "element.insert", { automatic: true }, `<main>\n  <section>\n    <p>1</p>\n    <div class="${C.content}"></div>\n  </section>\n</main>\n`);
});

test("element.insert { to }: a new node drops at the point after the rules; layout.automaticMorph rewrites a container in place", () => {
  const s = open(COL);
  drop(s, "element.insert", { snippet: `<span>new</span>`, to: { before: get(s, "p") } }, COL.replace("    <p>B</p>", "    <span>new</span>\n    <p>B</p>"));
  drop(s, "element.insert", { snippet: `<main></main>`, to: { before: get(s, "p") } }, false);
  const m = open(`<main>\n  <div></div>\n</main>\n`);
  drop(m, "layout.automaticMorph", { at: get(m, "div") }, `<main>\n  <section class="${C.section}"><div class="${C.content}"></div></section>\n</main>\n`);
});
