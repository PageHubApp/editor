import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEditor } from "@pagehub/engine/testing";
import { iconFilterOf, withIconRef } from "@pagehub/engine/kits";
import { iconFilterSource } from "../src/features/inspector/iconFilterHandle.ts";
import { iconImageSource } from "../src/features/inspector/componentRowControls.tsx";

// A feature-tile icon as the converter wrote it for Moss & Fern.
const FILTER = '<span class="text-primary inline-flex items-center justify-center w-6 h-6 box-content p-space-2xs rounded-full bg-secondary [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbShovel" | icon }}</span>';
const P = "p.liquid";
const ed = (inner: string) => createTestEditor({ files: { [P]: `<div class="tile">${inner}</div>\n` } });
const carryOf = (h: ReturnType<ReturnType<typeof ed>["get"]>) => ({ class: h.attr("class"), id: h.attr("id"), "data-edit-name": h.attr("data-edit-name") });

describe("icon: filter form <-> image form", () => {
  it("the image form is still an Icon, and a plain span around an image is not", () => {
    const e = ed(iconImageSource({ class: "w-6 h-6" }, "https://cdn.example/logo.png"));
    assert.equal(e.get("span").element.name, "html.icon");
    assert.equal(ed('<span class="x"><img src="a.png" alt=""></span>').get(".x").element.name === "html.icon", false);
    assert.equal(ed('<span class="x"><img class="size-full" src="a.png" alt=""><b>t</b></span>').get(".x").element.name === "html.icon", false);
  });

  it("filter -> image -> filter keeps the span's own classes and lands on the picked icon", () => {
    const e = ed(FILTER);
    const h = e.get("span");
    assert.ok(e.run("source.replace", { at: h, text: iconImageSource(carryOf(h), "https://cdn.example/logo.png") }));
    const img = e.get("span");
    assert.equal(img.element.name, "html.icon");
    assert.equal(iconFilterOf(img.node()), null);
    assert.ok(e.run("source.replace", { at: img, text: iconFilterSource(carryOf(img), "tb/TbLeaf") }));
    const back = e.get("span");
    assert.equal(back.element.name, "html.icon");
    assert.equal(iconFilterOf(back.node())?.ref, "tb/TbLeaf");
    const classes = back.classes();
    for (const c of FILTER.match(/class="([^"]+)"/)![1]!.split(" ")) assert.ok(classes.includes(c), c);
    assert.equal(classes.length, new Set(classes).size, "no duplicated classes");
    assert.equal(back.attr("aria-hidden"), "true");
    // and the filter form keeps editing in place
    assert.ok(e.run("source.replace", { at: back, text: withIconRef(back.text(), back.range.from, iconFilterOf(back.node())!, "tb/TbSun") }));
    assert.equal(iconFilterOf(e.get("span").node())?.ref, "tb/TbSun");
  });
});
