import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOptionsInner, parseOptions } from "../src/features/inspector/controls/element/formMarkup.ts";
import { plainText } from "../src/features/inspector/controls/element/elementControlShared.ts";
import { buildIconInner, buildLeafInner, parseIconInner, parseLeafInner } from "../src/features/inspector/controls/element/IconValueControl.tsx";
import { parseMapPoint } from "../src/features/inspector/controls/element/MapControls.tsx";

// The inspector reads these controls' values from the engine's parse, never a regex over markup.

describe("select options", () => {
  it("reads value and label of each <option>, in order", () => {
    assert.deepEqual(parseOptions('\n  <option value="a">Alpha</option>\n  <option value=\'b\'>Beta <b>two</b></option>\n'), [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta two" },
    ]);
  });

  it("keeps Liquid in a label or value as written, and an option with no value reads empty", () => {
    assert.deepEqual(parseOptions('<option value="{{ p.id }}">{{ p.title }} ({% if p.sale %}sale{% endif %})</option><option>Plain</option>'), [
      { value: "{{ p.id }}", label: "{{ p.title }} ({% if p.sale %}sale{% endif %})" },
      { value: "", label: "Plain" },
    ]);
  });

  it("is not fooled by a > inside an attribute value or a comment between options", () => {
    assert.deepEqual(parseOptions('<option data-x="a>b" value="v">One</option><!-- <option value="no">No</option> --><option value="w">Two</option>'), [
      { value: "v", label: "One" },
      { value: "w", label: "Two" },
    ]);
  });

  it("round-trips through buildOptionsInner", () => {
    const opts = [{ value: "a&b", label: "A <b>" }, { value: "c", label: "C" }];
    assert.deepEqual(parseOptions(buildOptionsInner(opts)).map((o) => o.label), ["A &lt;b&gt;", "C"]);
    assert.equal(parseOptions(buildOptionsInner([])).length, 0);
  });
});

describe("icon in a button's text", () => {
  it("finds the ref and which side it is on", () => {
    assert.deepEqual(parseIconInner("{{ 'tb/TbPhone' | icon }} Call us"), { ref: "tb/TbPhone", position: "before", text: "Call us" });
    assert.deepEqual(parseIconInner('Next {{- "tb/TbArrowRight" | icon: size: 20 -}}'), { ref: "tb/TbArrowRight", position: "after", text: "Next" });
    assert.deepEqual(parseIconInner("Plain label"), { ref: "", position: "before", text: "Plain label" });
  });

  it("ignores outputs that are not an icon, and a quote inside a nearby string", () => {
    assert.deepEqual(parseIconInner("{{ company.name | upcase }} {{ 'x/Y' | icon }}"), { ref: "x/Y", position: "after", text: "{{ company.name | upcase }}" });
    assert.equal(parseIconInner("{{ 'a/B' | upcase }}").ref, "");
  });

  it("builds and re-reads the same pair", () => {
    for (const position of ["before", "after"] as const) {
      assert.deepEqual(parseIconInner(buildIconInner("tb/TbX", position, "Go")), { ref: "tb/TbX", position, text: "Go" });
    }
  });
});

describe("icon wrapped in its span (the Icon element form)", () => {
  const BURGER = `<span aria-hidden="true">{{ "tb/TbMenu2" | icon }}</span>`;
  const IMG = `<span class="w-6"><img class="size-full object-contain" src="x.png" alt=""></span>`;

  it("an icon-only button has an empty label and keeps the span as the icon", () => {
    assert.deepEqual(parseLeafInner(BURGER), { ref: "tb/TbMenu2", source: BURGER, position: "before", text: "" });
  });

  it("the label is the text around the span, never its markup", () => {
    assert.equal(parseLeafInner(`${BURGER} Menu`).text, "Menu");
    assert.deepEqual(parseLeafInner(`Next <span class="a">{{ 'tb/TbArrowRight' | icon }}</span>`), { ref: "tb/TbArrowRight", source: `<span class="a">{{ 'tb/TbArrowRight' | icon }}</span>`, position: "after", text: "Next" });
    assert.equal(parseLeafInner(`${IMG} Call`).text, "Call");
    assert.equal(parseLeafInner(IMG).ref, "");
    assert.equal(parseLeafInner(IMG).source, IMG);
  });

  it("a span that holds more than the icon is label text, not an icon", () => {
    assert.equal(parseLeafInner(`<span>hi {{ 'a/B' | icon }}</span>`).text, "<span>hi </span>");
  });

  it("editing the label rebuilds around the icon's own markup", () => {
    const leaf = parseLeafInner(BURGER);
    assert.equal(buildLeafInner(leaf.source, leaf.position, "Menu"), `${BURGER} Menu`);
    const after = parseLeafInner(`Next <span class="a">{{ 'tb/TbArrowRight' | icon }}</span>`);
    assert.equal(buildLeafInner(after.source, after.position, "Go"), `Go <span class="a">{{ 'tb/TbArrowRight' | icon }}</span>`);
    assert.equal(buildLeafInner(leaf.source, leaf.position, ""), BURGER);
  });
});

describe("map pin text", () => {
  it("splits a leading heading from the description", () => {
    assert.deepEqual(parseMapPoint("<strong>Shop</strong> Open late"), { title: "Shop", description: "Open late" });
    assert.deepEqual(parseMapPoint("<h3>Head <em>er</em></h3>\n body <i>text</i>"), { title: "Head er", description: "body text" });
    assert.deepEqual(parseMapPoint("Only a description"), { title: "", description: "Only a description" });
    assert.deepEqual(parseMapPoint("Text first <strong>not a title</strong>"), { title: "", description: "Text first not a title" });
  });
});

describe("plain text of markup", () => {
  it("drops tags and comments, keeps text and Liquid", () => {
    assert.equal(plainText("  Hello <b>big</b> {{ name }}<!-- note --> world "), "Hello big {{ name }} world");
    assert.equal(plainText(""), "");
  });
});
