import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { classClipboardFacet, storedClassClipboard } from "../src/kits/html/classClipboard.ts";
import { CLIPBOARD_MIME, memoryClipboard, systemClipboard } from "../src/kits/html/clipboard.ts";
import { historyField } from "../src/history/history.ts";

const P = "p.html";
const PAGE = `<html>\n<body>\n  <section class="a b">\n    <h2 data-edit-id="x1y2z3">A</h2>\n    <p class="c">One</p>\n  </section>\n  <div data-edit-lock="delete">Locked</div>\n</body>\n</html>\n`;
const mem = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
};
const ed = (files: Record<string, string> = { [P]: PAGE }, extra: object[] = []) => createTestEditor({ files, extensions: [htmlKit({ clipboard: memoryClipboard() }), classClipboardFacet.of(storedClassClipboard(mem())), ...extra] as never[] });

test("copy rules: html, head, body and delete-locked elements can be neither copied, cut, duplicated nor deleted", () => {
  const e = ed();
  for (const sel of ["html", "body", "div"]) {
    e.select(e.get(sel));
    for (const cmd of ["element.copy", "element.cut", "element.duplicate", "element.remove", "classes.copy"]) assert.equal(e.can(cmd), false, `${cmd} on ${sel}`);
  }
  e.select(e.get("p"));
  for (const cmd of ["element.copy", "element.cut", "element.duplicate", "element.remove"]) assert.equal(e.can(cmd), true, `${cmd} on p`);
  assert.equal(e.press("backspace", { ui: { textEditing: true } }).handled, false, "typing keeps Backspace");
});

test("delete: one undo step, no confirmation, the parent is selected; a top-level node leaves nothing selected", () => {
  const e = ed({ [P]: `<section>\n  <p>A</p>\n</section>\n<footer>F</footer>\n` });
  e.select(e.get("p"));
  assert.ok(e.run("element.remove"));
  assert.equal(e.state.selection.primary, e.get("section"));
  assert.ok(e.undo());
  assert.ok(e.text().includes("<p>A</p>"));
  e.select(e.get("footer"));
  assert.ok(e.run("element.remove"));
  assert.equal(e.state.selection.handles.length, 0, "no parent element: nothing is selected");
});

test("delete: removing an element that renders a partial leaves the partial file and the other instances alone", () => {
  const files = { [P]: `<section>\n  {% render 'card' %}\n</section>\n<section>\n  {% render 'card' %}\n</section>\n`, "snippets/card.liquid": `<p>Card</p>\n` };
  const e = ed(files);
  e.select(e.find(P, "section")[0]!);
  assert.ok(e.run("element.remove"));
  assert.equal(e.text(), `<section>\n  {% render 'card' %}\n</section>\n`);
  assert.equal(e.state.files.get("snippets/card.liquid"), "<p>Card</p>\n", "the partial file is untouched");
});

test("duplicate: copies (overwriting the clipboard) and pastes the copy as the next sibling, selected, without edit ids", () => {
  const e = ed();
  e.select(e.get("p"));
  e.run("element.copy");
  e.select(e.get("h2"));
  assert.ok(e.run("element.duplicate"));
  assert.equal(e.find(P, "h2").length, 2);
  assert.equal(e.state.selection.primary, e.find(P, "h2")[1]);
  assert.ok(!/data-edit-id="x1y2z3"[\s\S]*data-edit-id="x1y2z3"/.test(e.text()), "ids are not copied");
  e.select(e.get("p"));
  e.run("element.paste");
  assert.equal(e.find(P, "h2").length, 3, "the duplicate overwrote the clipboard: paste adds another <h2>");
  assert.equal(e.find(P, "p").length, 1, "the earlier <p> copy is gone from the clipboard");
  assert.ok(e.text().includes('<p class="c">One</p>\n    <h2>A</h2>'));
});

test("duplicate is one undo step", () => {
  const e = ed();
  e.select(e.get("p"));
  const before = e.text();
  e.run("element.duplicate");
  assert.equal(e.state.field(historyField).done.length, 1);
  e.undo();
  assert.equal(e.text(), before);
});

test("copy classes / paste classes: replace the class attribute in one write; refused without classes or a value", () => {
  const e = ed();
  e.select(e.get("p"));
  assert.equal(e.can("classes.paste"), false, "nothing copied");
  e.select(e.get("section"));
  assert.ok(e.run("classes.copy"));
  e.select(e.get("p"));
  assert.ok(e.run("classes.paste"));
  assert.match(e.text(), /<p class="a b">One<\/p>/);
  assert.equal(e.can("classes.paste"), false, "already identical");
  assert.equal(e.state.field(historyField).done.length, 1);
  e.undo();
  assert.match(e.text(), /<p class="c">One<\/p>/);
  e.select(e.get("h2"));
  assert.equal(e.can("classes.copy"), false, "an element without classes has none to copy");
  e.select(e.get("div"));
  assert.equal(e.can("classes.paste"), false, "a locked element takes no pasted classes");
});

test("the class clipboard survives a reload: it is stored, not held by the editor", () => {
  const storage = mem();
  const a = createTestEditor({ files: { [P]: PAGE }, extensions: [htmlKit({ clipboard: memoryClipboard() }), classClipboardFacet.of(storedClassClipboard(storage))] });
  a.select(a.get("section"));
  a.run("classes.copy");
  const b = createTestEditor({ files: { [P]: PAGE }, extensions: [htmlKit({ clipboard: memoryClipboard() }), classClipboardFacet.of(storedClassClipboard(storage))] });
  b.select(b.get("p"));
  assert.equal(b.can("classes.paste"), true);
  assert.deepEqual(JSON.parse(storage.getItem("ph-canvas-class-clipboard")!), { className: "a b" });
});

test("copy / paste across two editors through the system clipboard", async () => {
  let osData: Record<string, string> = {};
  class Item { constructor(readonly items: Record<string, Blob>) {} }
  const os = {
    write: async (items: Item[]) => {
      osData = {};
      for (const [t, blob] of Object.entries(items[0]!.items)) osData[t.replace(/^web /, "")] = await blob.text();
    },
    read: async () => [{ types: Object.keys(osData), getType: async (t: string) => ({ text: async () => osData[t]! }) }],
  };
  const mk = (files: Record<string, string>) => createTestEditor({ files, extensions: [htmlKit({ clipboard: systemClipboard({ clipboard: os, ClipboardItem: Item as never }) })] });
  const a = mk({ [P]: `<div>\n  <p>from A</p>\n</div>\n` });
  a.select(a.get("p"));
  assert.ok(a.run("element.copy"));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(osData[CLIPBOARD_MIME], "<p>from A</p>");
  const clipB = systemClipboard({ clipboard: os, ClipboardItem: Item as never });
  await clipB.refresh();
  const b = createTestEditor({ files: { [P]: `<ul>\n  <li>x</li>\n</ul>\n` }, extensions: [htmlKit({ clipboard: clipB })] });
  b.select(b.get("li"));
  assert.ok(b.press("mod+v").handled);
  assert.equal(b.text(), "<ul>\n  <li>x</li>\n  <p>from A</p>\n</ul>\n");
});
