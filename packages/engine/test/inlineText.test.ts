import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlKit } from "../src/kits.ts";
import { createTestEditor } from "../src/testing/index.ts";
import { isRichTextLeaf, sanitizeInline, inlineText, diffSplice } from "../src/kits/html/inlineText.ts";
import { historyField } from "../src/history/history.ts";

const PAGE = `<main>
  <h1 class="t">Hello <strong>world</strong> {{ shop.name }}</h1>
  <p>
    Body text
  </p>
  <p>{% if x %}a{% endif %}</p>
  <div><p>block child</p></div>
  <span></span>
  <div></div>
</main>
`;
const open = () => createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), inlineText()] });

test("rich-text leaves: text / outputs / inline elements only; empty text tags count; Liquid tags and blocks don't", () => {
  const e = open();
  const [h1] = e.find("index.liquid", "h1");
  const ps = e.find("index.liquid", "p");
  const divs = e.find("index.liquid", "div");
  assert.ok(isRichTextLeaf(h1));
  assert.ok(isRichTextLeaf(ps[0]));
  assert.ok(!isRichTextLeaf(ps[1]), "a Liquid tag inside");
  assert.ok(isRichTextLeaf(ps[2]));
  assert.ok(!isRichTextLeaf(divs[0]), "block child");
  assert.ok(isRichTextLeaf(e.find("index.liquid", "span")[0]), "empty span is a text leaf");
  assert.ok(!isRichTextLeaf(divs[1]), "an empty div is not");
});

test("an Icon (span holding only an icon output, or the full-size image form) is never a rich-text leaf", () => {
  const e = createTestEditor({
    files: {
      "index.liquid": `<button type="button"><span class="a" aria-hidden="true">{{ "tb/TbMenu2" | icon }}</span></button><span class="b"><img class="size-full object-contain" src="x.png" alt=""></span><span class="c">{{ shop.name }}</span>`,
    },
    extensions: [htmlKit(), inlineText()],
  });
  const [a, b, c] = e.find("index.liquid", "span");
  assert.ok(!isRichTextLeaf(a), "icon filter span");
  assert.ok(!isRichTextLeaf(b), "icon image span");
  assert.ok(isRichTextLeaf(c), "a plain output span stays text");
});

test("sanitizeInline: unwraps block / unknown elements, drops on* and unsafe URLs, removes Liquid tags, keeps outputs", () => {
  assert.equal(sanitizeInline(`a <div>b</div> <b onclick="x()" class="k">c</b>`), `a b <b class="k">c</b>`);
  assert.equal(sanitizeInline(`<a href="javascript:alert(1)" target="_blank">x</a>`), `<a target="_blank">x</a>`);
  assert.equal(sanitizeInline(`<a href="{{ url }}">x</a> {{ name }}`), `<a href="{{ url }}">x</a> {{ name }}`);
  assert.equal(sanitizeInline(`{% if a %}y{% endif %}`), `y`);
  assert.equal(sanitizeInline(`<script>bad()</script>ok`), `ok`);
  assert.equal(sanitizeInline(`<b>unclosed`), `&lt;b&gt;unclosed`);
});

test("diffSplice trims to the differing bytes", () => {
  assert.deepEqual(diffSplice("Hello world", "Hello there world", 10), { from: 16, to: 16, insert: "there " });
  assert.equal(diffSplice("same", "same"), null);
});

test("text.setInner keeps the leaf's indentation, writes inline HTML, and is one step per group", () => {
  const e = open();
  const p = e.find("index.liquid", "p")[0]!;
  assert.ok(e.run("text.setInner", { target: p, source: "Body <em>text</em>" }));
  assert.match(e.text(), /<p>\n    Body <em>text<\/em>\n  <\/p>/);
  assert.ok(e.run("text.setInner", { target: p, source: "Body <em>text</em>!" }));
  assert.equal(e.state.field(historyField).done.length, 1, "same leaf within 500 ms: one step");
  assert.ok(!e.run("text.setInner", { target: p, source: "Body <em>text</em>!" }), "no change: nothing to do");
  assert.ok(!e.run("text.setInner", { target: e.find("index.liquid", "div")[0]!, source: "x" }), "not a leaf");
  e.undo();
  assert.equal(e.text(), PAGE);
});
