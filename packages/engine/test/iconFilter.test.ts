import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iconFilterOf, withIconRef } from "../src/kits/html/iconFilter.ts";
import { createTestEditor } from "../src/testing/index.ts";

const P = "p.liquid";

// Icon spans exactly as the converter wrote them for Moss & Fern (hero feature tile, care tiles, cart, a text-primary row, an image-less empty state).
const MF_ICONS = [
  '<span class="fill-current inline-flex items-center justify-center w-8 h-8 text-primary [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbMailCheck" | icon }}</span>',
  '<span class="text-primary inline-flex items-center justify-center w-5 h-5 shrink-0 mt-0.5 [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbPlant2" | icon }}</span>',
  '<span class="inline-flex items-center justify-center w-6 h-6 box-content p-space-2xs rounded-full bg-secondary [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbShovel" | icon }}</span>',
  '<span class="w-5 h-5 fill-current flex items-center justify-center [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbShoppingCart" | icon }}</span>',
  '<span class="text-base-content/30 inline-flex items-center justify-center w-16 h-16 [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbPhoto" | icon }}</span>',
];

const ed = (inner: string) => createTestEditor({ files: { [P]: `<section>\n  <div class="tile">${inner}</div>\n</section>\n` } });

describe("icon filter span", () => {
  for (const html of MF_ICONS) {
    const ref = /"([a-z]+\/\w+)"/.exec(html)![1]!;
    it(`${ref} resolves to the Icon element and reads its ref`, () => {
      const e = ed(html);
      const h = e.get("span");
      assert.equal(h.element.name, "html.icon");
      assert.equal(h.element.inspectorFor(h.tag).type, "icon");
      assert.equal(h.element.insert?.label, "Icon");
      assert.equal(iconFilterOf(h.node())?.ref, ref);
    });

    it(`${ref} swaps the ref and nothing else, and swaps back to the original text`, () => {
      const e = ed(html);
      const h = e.get("span");
      const icon = iconFilterOf(h.node())!;
      assert.ok(e.run("source.replace", { at: h, text: withIconRef(h.text(), h.range.from, icon, "tb/TbLeaf") }));
      assert.equal(e.text(), `<section>\n  <div class="tile">${html.replace(ref, "tb/TbLeaf")}</div>\n</section>\n`);
      const again = e.get("span");
      assert.equal(iconFilterOf(again.node())?.ref, "tb/TbLeaf");
      assert.ok(e.run("source.replace", { at: again, text: withIconRef(again.text(), again.range.from, iconFilterOf(again.node())!, ref) }));
      assert.equal(e.text(), `<section>\n  <div class="tile">${html}</div>\n</section>\n`);
    });
  }

  it("keeps single quotes and the filter's arguments", () => {
    const html = "<span class=\"w-4 h-4\">{{- 'tb/TbX' | icon: size: 20 -}}</span>";
    const e = ed(html);
    const h = e.get("span");
    const icon = iconFilterOf(h.node())!;
    assert.equal(withIconRef(h.text(), h.range.from, icon, "tb/TbY"), "<span class=\"w-4 h-4\">{{- 'tb/TbY' | icon: size: 20 -}}</span>");
  });

  it("is only a span holding just the icon output", () => {
    for (const html of [
      '<span class="x">Label {{ "tb/TbX" | icon }}</span>',
      '<span class="x">{{ "tb/TbX" | upcase }}</span>',
      '<span class="x">{{ icon_name | icon }}</span>',
      '<span class="x"></span>',
      '<div class="x">{{ "tb/TbX" | icon }}</div>',
    ]) assert.equal(ed(html).get(".x").element.name === "html.icon", false, html);
  });
});
