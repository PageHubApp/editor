import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../src/editor/createEditor.ts";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { liquidKit } from "../src/kits/liquid/liquidKit.ts";
import { HTML_ID_ELEMENTS, idElementsFacet } from "../src/kits/html/idElements.ts";
import { CLIPBOARD_MIME, memoryClipboard, readClipboardPayload, sharedClipboard, systemClipboard } from "../src/kits/html/clipboard.ts";
import { DEFAULT_ID_ELEMENTS } from "../src/identity/persisted.ts";
import { SAMPLE } from "./helpers.ts";

const P = "p.html";
const PAGE = `<main>\n  <section class="a">\n    <h2>A</h2>\n    <p>One</p>\n  </section>\n  <div></div>\n</main>\n`;
const ed = (files: Record<string, string> = { [P]: PAGE }, extra: object = {}) => createTestEditor({ files, ...extra });
const el = (h: any) => h.element.name as string;

test("kits: html and liquid elements resolve on the sample", () => {
  const e = ed({ "pages/index.liquid": SAMPLE });
  const names = new Set(e.state.tree("pages/index.liquid").flat.map((n) => el(e.registry.of("pages/index.liquid", n))));
  for (const n of ["html.section", "html.container", "html.heading", "html.text", "html.link", "html.button", "liquid.if", "liquid.render"]) assert.ok(names.has(n), n);
  assert.equal(el(e.get("h1", "pages/index.liquid")), "html.heading");
  const h1 = e.get("h1", "pages/index.liquid");
  assert.equal(h1.element.readProp(h1, "level"), "h1");
});

test("kits: the html kit owns the id-element list (one source); persisted identity reads the configured set", async () => {
  assert.equal(DEFAULT_ID_ELEMENTS, HTML_ID_ELEMENTS);
  const e = await createEditor({ storage: { [P]: "<main><x-card>Hi</x-card></main>" }, identity: "persisted", mint: (() => { let i = 0; return () => `id${String(++i).padStart(4, "0")}`; })(), extensions: [htmlKit(), liquidKit(), idElementsFacet.of(new Set(["x-card"]))] });
  assert.match(e.state.files.get(P)!, /<x-card data-edit-id="id\d{4}">/);
  assert.match(e.state.files.get(P)!, /<main data-edit-id=/);
});

test("kits: duplicate (mod+d) inserts the copy after the node and selects it; one undo step", () => {
  const e = ed();
  e.select(e.get("section"));
  assert.deepEqual(e.press("mod+d"), { handled: true, command: "element.duplicate" });
  assert.equal(e.find(P, "section").length, 2);
  assert.equal(e.state.selection.primary, e.find(P, "section")[1]);
  assert.ok(e.undo());
  assert.equal(e.text(), PAGE);
});

test("kits: delete selects the parent; pass-through with nothing selected, in text, or on a locked node", () => {
  const e = ed();
  assert.equal(e.press("backspace").handled, false);
  e.select(e.get("h2"));
  assert.equal(e.press("delete", { ui: { textEditing: true } }).handled, false);
  assert.equal(e.press("backspace").handled, true);
  assert.equal(e.state.selection.primary, e.get("section"));
  assert.ok(!e.text().includes("<h2>"));
  const l = ed({ [P]: `<div><p data-edit-lock="delete">x</p></div>` });
  l.select(l.get("p"));
  assert.equal(l.press("backspace").handled, false);
});

test("kits: copy then paste without changing the selection; paste after the node, pasted node selected", () => {
  const e = ed({ [P]: PAGE }, { extensions: [htmlKit({ clipboard: memoryClipboard() }), liquidKit()] });
  assert.equal(e.press("mod+c").handled, false, "nothing selected → native copy");
  e.select(e.get("p"));
  assert.equal(e.press("mod+v").handled, false, "empty clipboard → native paste");
  assert.equal(e.press("mod+c").handled, true);
  assert.equal(e.press("mod+v").handled, true, "paste right after copy");
  assert.equal(e.find(P, "p").length, 2);
  assert.equal(e.state.selection.primary, e.find(P, "p")[1]);
  assert.equal(e.press("mod+v", { ui: { mediaManagerOpen: true } }).handled, false, "media manager gets the paste");
  assert.ok(e.text().includes("    <p>One</p>\n    <p>One</p>\n"), "indented like its siblings");
});

test("kits: the default clipboard is shared across editors; cut removes; foreign HTML pastes as escaped source", () => {
  const a = ed();
  a.select(a.get("h2"));
  assert.ok(a.run("element.cut"));
  assert.equal(sharedClipboard.read()?.source, "<h2>A</h2>");
  const b = ed({ [P]: "<div>\n  <p>x</p>\n</div>\n" });
  b.select(b.get("p"));
  assert.ok(b.run("element.paste"));
  assert.equal(b.text(), "<div>\n  <p>x</p>\n  <h2>A</h2>\n</div>\n");
  const foreign = readClipboardPayload((t) => (t === "text/html" ? `<html><body><!--StartFragment--><b>Hi {{ x }}</b><!--EndFragment--></body></html>` : ""))!;
  assert.deepEqual(foreign, { source: "<b>{% raw %}Hi {{ x }}{% endraw %}</b>", foreign: true });
  assert.ok(b.run("element.paste", { source: foreign.source }));
  assert.ok(b.text().includes("<b>{% raw %}Hi {{ x }}{% endraw %}</b>"));
  assert.equal(b.can("element.paste", { source: "<div>" }), false, "unparseable source never pastes");
});

test("kits: systemClipboard writes our marker to the OS clipboard and refreshes from it", async () => {
  const written: any[] = [];
  class Item { constructor(readonly items: Record<string, Blob>) {} }
  let osData: Record<string, string> = {};
  const os = {
    write: async (items: any[]) => void written.push(...items),
    read: async () => [{ types: Object.keys(osData), getType: async (t: string) => ({ text: async () => osData[t]! }) }],
  };
  const c = systemClipboard({ clipboard: os, ClipboardItem: Item as any });
  c.write("<p>x</p>");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(Object.keys(written[0].items).sort(), ["text/html", "text/plain", `web ${CLIPBOARD_MIME}`]);
  osData = { "text/html": "<meta charset='utf-8'><i>from another app</i>" };
  await c.refresh();
  assert.deepEqual(c.read(), { source: "<i>from another app</i>", foreign: true });
  assert.deepEqual(c.fromEvent({ getData: (t) => (t === CLIPBOARD_MIME ? "<p>ours</p>" : "") }), { source: "<p>ours</p>", foreign: false });
});

test("kits: tab / shift+tab cycle siblings; alt+up / alt+down move; escape selects the parent then clears; select parent / child", () => {
  const e = ed();
  e.select(e.get("h2"));
  e.press("tab");
  assert.equal(e.state.selection.primary, e.get("p"));
  e.press("tab");
  assert.equal(e.state.selection.primary, e.get("h2"), "wraps around");
  e.press("shift+tab");
  assert.equal(e.state.selection.primary, e.get("p"));
  assert.equal(e.press("alt+down").handled, false, "last child can't move down");
  assert.equal(e.press("alt+up").handled, true);
  assert.ok(e.text().includes("<p>One</p>\n    <h2>A</h2>"));
  assert.equal(e.state.selection.primary?.tag, "p", "selection follows the moved node");
  assert.ok(e.run("element.selectParent"));
  assert.equal(e.state.selection.primary, e.get("section"));
  assert.ok(e.run("element.selectChild"));
  assert.equal(e.state.selection.primary, e.get("p"));
  assert.equal(e.press("escape").command, "selection.up", "Esc selects the parent");
  assert.equal(e.state.selection.primary, e.get("section"));
  for (let i = 0; i < 6 && e.state.selection.handles.length; i++) e.press("escape");
  assert.equal(e.state.selection.handles.length, 0, "at the root Esc deselects");
  assert.equal(e.press("escape").handled, false);
});

test("kits: insert goes inside an empty container, else after the selection; data-edit-block only with blockProvenance", async () => {
  const e = ed();
  e.select(e.get("div"));
  assert.ok(e.run("element.insert", { element: "html.heading", block: "hero-one" }));
  assert.ok(e.text().includes("<div><h2>Heading</h2></div>"), e.text()); // an empty inline container stays inline (whitespace rule)
  assert.equal(e.state.selection.primary?.tag, "h2");
  const p = await createEditor({ storage: { [P]: PAGE }, blockProvenance: true });
  p.select(p.find(P, "section")[0]!);
  assert.ok(p.run("element.insert", { snippet: "<section>\n  <h2>B</h2>\n</section>", block: "hero-one" }));
  assert.ok(p.state.files.get(P)!.includes(`<section data-edit-block="hero-one">`));
  assert.equal(p.can("element.insert", { snippet: "<p>x</p>", block: "Bad Slug" }), false);
  const none = await createEditor({ storage: { [P]: "<main>\n  <p>a</p>\n</main>\n" } });
  assert.ok(none.run("element.insert", { snippet: "<footer></footer>", path: P }), "nothing selected: append to the file");
  assert.ok(none.state.files.get(P)!.endsWith("</main>\n<footer></footer>\n"), JSON.stringify(none.state.files.get(P)));
});

test("kits: mod+s saves through storage; wrap", async () => {
  const e = ed();
  e.select(e.get("p"));
  assert.ok(e.run("element.wrap", { tag: "article" }));
  assert.equal(e.press("mod+s").handled, true);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok((await e.memory.read(P))!.text.includes("<article>\n      <p>One</p>\n    </article>"));
  assert.equal(e.press("mod+s", { ui: { textEditing: true } }).handled, false);
});

test("kits: liquid commands and the built-in block tags in the parser environment", () => {
  const e = ed({ [P]: `<div>\n  <p>x</p>\n  {% section 'hero', title: "Hi" %}\n  {% map lat: 1, lng: 2 %}<b>pin</b>{% endmap %}\n</div>\n` });
  assert.equal(el(e.get("b")) , "html.text");
  assert.equal(e.get("b").parent()?.tag, "map", "{% map %} parses as a block");
  e.select(e.get("p"));
  assert.ok(e.run("liquid.wrapIf", { condition: "customer" }));
  assert.ok(e.text().includes("{% if customer %}\n    <p>x</p>\n  {% endif %}"), e.text());
  assert.equal(e.can("liquid.wrapIf", { condition: "x %}{% raw" }), false);
  const s = e.find(P, "section")[0] ?? e.state.tree(P).flat.map((n) => e.registry.of(P, n)).find((h) => h.tag === "section")!;
  e.select(s);
  assert.ok(e.run("liquid.setArg", { name: "title", value: '"Bye"' }));
  assert.ok(e.text().includes(`{% section 'hero', title: "Bye" %}`));
  assert.equal(el(s), "liquid.section");
});
