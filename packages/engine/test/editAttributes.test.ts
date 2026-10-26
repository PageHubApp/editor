import { test } from "node:test";
import assert from "node:assert/strict";
import { stripEditAttributes, validateEditAttribute, isEditAttribute, EDIT_ATTRIBUTES, EDITABLE_ATTRIBUTE, createParserEnvironment } from "../src/index.ts";
import { assertMinimalEdit } from "./helpers.ts";

const STORED = `<section data-edit-id="k3j9x2" data-edit-block="hero-split" data-edit-name="Hero" class="py-8">
  <h1 data-edit-id="a1b2c3" data-editable="text">Smog checks</h1>
  <img data-edit-id='zz9yy8' src="a.jpg" data-edit-name=Photo alt="">
  <div data-edit-lock="drag delete" data-section="hero" data-editable>x</div>
</section>
`;

test("stripEditAttributes: removes every data-edit-* attribute and nothing else (data-editable is author markup, kept)", () => {
  const out = stripEditAttributes(STORED);
  assert.equal(
    out,
    `<section class="py-8">
  <h1 data-editable="text">Smog checks</h1>
  <img src="a.jpg" alt="">
  <div data-section="hero" data-editable>x</div>
</section>
`,
  );
  assert.ok(!out.includes("data-edit-"));
});

test("stripEditAttributes: returns the same string when there is nothing to strip", () => {
  const src = `<p class="a">{{ x }}</p>`;
  assert.equal(stripEditAttributes(src), src);
});

test("stripEditAttributes: removal keeps every other byte (minimal edit)", () => {
  const src = `<div data-edit-id="k3j9x2">\n  <p>hi</p>\n</div>\n`;
  const out = stripEditAttributes(src);
  const at = src.indexOf(` data-edit-id`);
  assertMinimalEdit(src, out, [{ start: at, end: at + ` data-edit-id="k3j9x2"`.length }]);
});

test("stripEditAttributes: works with custom block tags registered on the parser", () => {
  const env = createParserEnvironment([{ name: "map", parseLike: "form" }]);
  const src = `{% map lat: 1 %}<div data-edit-id="m1m1m1" class="pin">pin</div>{% endmap %}`;
  assert.equal(stripEditAttributes(src, { env }), `{% map lat: 1 %}<div class="pin">pin</div>{% endmap %}`);
});

test("validateEditAttribute: accepts valid values, rejects the rest", () => {
  assert.equal(validateEditAttribute(EDIT_ATTRIBUTES.id, "k3j9x2"), null);
  assert.match(validateEditAttribute(EDIT_ATTRIBUTES.id, "K3J9")!, /must match/);
  assert.equal(validateEditAttribute(EDIT_ATTRIBUTES.lock, "drag delete drop-in move-out"), null);
  assert.equal(validateEditAttribute(EDIT_ATTRIBUTES.lock, "sealed"), null);
  assert.match(validateEditAttribute(EDIT_ATTRIBUTES.lock, "drag sealed")!, /unknown lock sealed/);
  assert.equal(validateEditAttribute(EDITABLE_ATTRIBUTE, "image"), null);
  assert.match(validateEditAttribute(EDITABLE_ATTRIBUTE, "html")!, /one of text, image, link/);
  assert.equal(validateEditAttribute(EDIT_ATTRIBUTES.block, "hero-split"), null);
  assert.match(validateEditAttribute(EDIT_ATTRIBUTES.src, "pages/index.liquid#12")!, /canvas-only/);
  assert.match(validateEditAttribute("data-edit-color", "x")!, /not a known/);
  assert.ok(isEditAttribute("data-edit-id") && !isEditAttribute(EDITABLE_ATTRIBUTE) && !isEditAttribute("data-edit"));
});
