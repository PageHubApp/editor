import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { isPeerToken } from "../src/kits/html/peerInherit.ts";

const P = "p.html";
const ed = (src: string) => createTestEditor({ files: { [P]: src }, extensions: [htmlKit()] });

test("peer class inherit: a button inserted next to a button copies its modifiers and raw tokens in the same edit", () => {
  const e = ed(`<div class="flex">\n  <button class="btn btn-primary rounded-full px-6 uppercase">Go</button>\n  <p>x</p>\n</div>\n`);
  e.select(e.get("button"));
  const undo = e.state.files.get(P);
  assert.ok(e.run("element.insert", { element: "html.button" }));
  assert.match(e.text(), /<button class="btn btn-primary rounded-full px-6 uppercase" type="button">Button<\/button>/);
  assert.ok(e.undo(), "one undo step");
  assert.equal(e.state.files.get(P), undo);
});

test("peer class inherit: the snippet's own raw tokens are replaced, others kept; the left neighbour wins over the right", () => {
  const e = ed(`<div>\n  <button class="rounded-lg">L</button>\n  <p>x</p>\n  <button class="rounded-none">R</button>\n</div>\n`);
  e.select(e.get("p"));
  assert.ok(e.run("element.insert", { snippet: '<button class="shadow rounded-sm">B</button>' }));
  assert.match(e.text(), /<button class="shadow rounded-lg">B<\/button>/);
});

test("peer class inherit: not in a parent the definition doesn't list, and not without a same-kind sibling", () => {
  const e = ed(`<ul>\n  <li><button class="rounded-full">A</button></li>\n</ul>\n<div>\n  <p>x</p>\n</div>\n`);
  e.select(e.get("p"));
  assert.ok(e.run("element.insert", { element: "html.button" }));
  assert.match(e.text(), /<button type="button">Button<\/button>/);
  assert.equal(isPeerToken("p-4"), false);
  assert.equal(isPeerToken("md:rounded-xl"), true);
  assert.equal(isPeerToken("md:w-1/2"), true);
});

test("a page (<main>) inserted with a selection inside always lands at the top level of the file", () => {
  const e = ed(`<header>H</header>\n<main>\n  <section>\n    <p>x</p>\n  </section>\n</main>\n`);
  e.select(e.get("p"));
  assert.ok(e.run("element.insert", { snippet: "<main>\n  <p>two</p>\n</main>" }));
  const text = e.text();
  assert.ok(text.indexOf("<p>two</p>") > text.indexOf("</main>"), "after the first page, not inside it");
});

test("click inserts obey the drop rules: a form inside a form is refused", () => {
  const e = ed(`<form>\n  <p>x</p>\n</form>\n`);
  e.select(e.get("p"));
  assert.equal(e.can("element.insert", { snippet: "<form></form>" }), false);
  assert.equal(e.can("element.insert", { snippet: "<p>y</p>" }), true);
});

test("Add empty section (the selected page) and Add container (any other container) append an empty flex column", () => {
  const e = ed(`<main>\n  <section>\n    <p>x</p>\n  </section>\n</main>\n`);
  e.select(e.get("main"));
  assert.equal(e.can("element.addContainer"), false, "a page takes sections");
  assert.ok(e.run("element.addSection"));
  assert.match(e.text(), /<section class="gap-section flex w-full flex-col"><\/section>\s*<\/main>/);
  assert.equal(e.state.selection.primary?.tag, "section", "the new element is selected");
  e.select(e.get("section"));
  assert.equal(e.can("element.addSection"), false);
  assert.ok(e.run("element.addContainer"));
  assert.ok(e.undo());
});

test("Select parent stops at the document: the parent of a body child is not selectable", () => {
  const e = ed(`<html>\n<body>\n  <section>\n    <p>x</p>\n  </section>\n</body>\n</html>\n`);
  e.select(e.get("p"));
  assert.equal(e.can("element.selectParent"), true);
  e.select(e.get("section"));
  assert.equal(e.can("element.selectParent"), false);
});
