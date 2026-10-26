import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { type ElementTreeNode } from "@pagehub/engine";
import { htmlKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { leafToDoc } from "../src/features/richtext/toDoc.ts";
import { docToSource } from "../src/features/richtext/toSource.ts";
import { RichTextSession } from "../src/features/richtext/session.ts";
import { richTextKit } from "../src/features/richtext/richTextState.ts";

const P = "index.liquid";
const leafEditor = (inner: string) =>
  createTestEditor({ files: { [P]: `<section>\n  <h1 class="t">${inner}</h1>\n</section>\n` }, extensions: [htmlKit(), richTextKit()] });

const roundTrip = (inner: string) => {
  const e = leafEditor(inner);
  return docToSource(leafToDoc(e.text(), e.get("h1").node() as ElementTreeNode));
};

test("connector: inner source → doc → source is byte-exact for marks, links, outputs and atoms", () => {
  for (const inner of [
    `Hello <b class="x">bold</b> and <em>it</em>`,
    `Go <a href="{{ url }}" target="_blank">there</a>, {{ shop.name | upcase }}!`,
    `A<br>B <img src="/a.png" alt="a"> <span class="text-primary">tint</span> <small data-edit-id="k">s</small>`,
    `Literal {{ '{{' }} braces &amp; &lt;tags&gt;`,
  ]) assert.equal(roundTrip(inner), inner);
});

test("connector: outputs are atom chips; {{ '{{' }} reads back as typed text; whitespace collapses", () => {
  const e = leafEditor(`\n    Hi   {{ name }}\n    {{ '{{' }}\n  `);
  const doc = leafToDoc(e.text(), e.get("h1").node() as ElementTreeNode);
  assert.deepEqual(doc.content!.map((n) => n.type), ["text", "liquidOutput", "text"]);
  assert.equal(doc.content![0]!.text, "Hi ");
  assert.equal(doc.content![2]!.text, " {{");
});

test("connector: typing `{{` writes {{ '{{' }}; a new bold mark writes <strong>", () => {
  assert.equal(docToSource({ type: "doc", content: [{ type: "text", text: "a {{ b" }, { type: "text", text: "c", marks: [{ type: "bold" }] }] }), `a {{ '{{' }} b<strong>c</strong>`);
});

function mountLeaf(e: ReturnType<typeof leafEditor>) {
  const el = document.createElement("h1");
  document.body.appendChild(el);
  const calls: string[] = [];
  const s = new RichTextSession(e, e.get("h1"), el, { openPanel: (p) => calls.push(p), escape: () => calls.push("esc"), changed: () => {} });
  return { s, el, calls };
}

test("session: TipTap mounts on the leaf element itself; no <p> wrapper", () => {
  const e = leafEditor(`Hi <b>there</b>`);
  const { s, el } = mountLeaf(e);
  assert.equal(el.getAttribute("contenteditable"), "true");
  assert.ok(el.classList.contains("ProseMirror"));
  assert.equal(el.querySelector("p"), null);
  assert.equal(s.serialize(), `Hi <b>there</b>`);
  s.end();
  assert.equal(el.hasAttribute("data-rt-editing"), false);
});

test("undo step (fix): typing 10 characters commits once; one undo restores the original source exactly", () => {
  const e = leafEditor(`Hello`);
  const before = e.text();
  const { s } = mountLeaf(e);
  for (const ch of "0123456789") s.editor.commands.insertContent(ch);
  assert.equal(e.text(), before, "nothing written while typing");
  assert.ok(s.flush(true));
  assert.match(e.text(), /<h1 class="t">Hello0123456789<\/h1>/);
  assert.ok(e.undo());
  assert.equal(e.text(), before);
  s.end();
});
