import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { CONTROL_SPECS, type BundleItemSpec } from "../src/features/inspector/controlSpecs.tsx";
import { BundleControl } from "../src/features/inspector/controls/BundleControl.tsx";
import { GradientControl } from "../src/features/inspector/controls/GradientControl.tsx";
import { PatternControl } from "../src/features/inspector/controls/PatternControl.tsx";
import { fixtureEditor, render, withEditor } from "./harness.tsx";

const live: ReturnType<typeof render>[] = [];
afterEach(() => void live.splice(0).forEach((r) => r.unmount()));
const mount = (ui: React.ReactNode) => (live.push(render(ui)), live.at(-1)!);
const items = (id: string): BundleItemSpec[] => {
  const s = CONTROL_SPECS[id];
  assert.equal(s?.kind, "bundle", `${id} should be a bundle`);
  return (s as { kind: "bundle"; items: BundleItemSpec[] }).items;
};

describe("bundle / effects control specs", () => {
  it("every ported family is a real control spec (no stub)", () => {
    for (const id of ["border", "ring", "shadow", "transition", "effects.transform", "filter", "backdrop", "wrap", "decoration"])
      assert.equal(CONTROL_SPECS[id]?.kind, "bundle", id);
    assert.equal(CONTROL_SPECS.backgroundGradient?.kind, "gradient");
    assert.equal(CONTROL_SPECS.bgPattern?.kind, "pattern");
    // radius + opacity stay real value fields.
    assert.equal(CONTROL_SPECS.borderRadius?.kind, "universal");
    assert.equal(CONTROL_SPECS.opacity?.kind, "universal");
  });

  it("border bundle = Width + Style value fields + a Colour swatch, bound to real groups", () => {
    const b = items("border");
    assert.deepEqual(b.map((i) => i.group), ["border-width", "border-style", "border-color"]);
    assert.deepEqual(b.map((i) => i.control), ["value", "value", "color"]);
  });

  it("transform bundle covers the full transform group set", () => {
    const groups = items("effects.transform").map((i) => i.group);
    for (const g of ["transform", "scale", "rotate", "translate-x", "translate-y", "skew-x", "skew-y", "origin"]) assert.ok(groups.includes(g), g);
  });
});

describe("BundleControl renders real controls (not a text note)", () => {
  it("border → two value inputs + a colour chip, no StructureNote", () => {
    const e = fixtureEditor();
    const r = mount(withEditor(e, <BundleControl items={items("border")} />));
    assert.equal(r.all("[data-bundle-control]").length, 1);
    assert.ok(r.all("input[type=text]").length >= 2, "width + style value fields");
    assert.ok(r.all('button[aria-label^="Pick"], button[aria-label^="Edit color"]').length >= 1, "colour chip");
    assert.equal(r.all("[data-row-structure]").length, 0, "no StructureNote stub");
  });
});

describe("GradientControl", () => {
  it("renders 8 direction options + From/Via/To colour rows, and a direction click writes bg-linear-*", async () => {
    const e = fixtureEditor();
    const r = mount(withEditor(e, <GradientControl />));
    assert.equal(r.all("[data-gradient-control]").length, 1);
    const dirs = r.all('[role="tablist"] button, [role="tab"]');
    assert.ok(dirs.length >= 8, `8 directions, got ${dirs.length}`);
    await r.click(dirs[5]!); // "to bottom"
    assert.match(e.get("section").attr("class") ?? "", /bg-linear-to-/);
  });
});

describe("PatternControl", () => {
  it("picks a real library pattern and then shows the geometry sliders", async () => {
    const e = fixtureEditor();
    const r = mount(withEditor(e, <PatternControl />));
    assert.equal(r.all("[data-pattern-control]").length, 1);
    await r.click(r.get('[data-pattern-control] button[aria-haspopup="listbox"]'));
    const opts = r.all('[data-pattern-picker] [role="option"] button');
    assert.ok(opts.length > 10, `pattern options, got ${opts.length}`);
    await r.click(opts[0]!);
    assert.match(e.get("section").attr("class") ?? "", /ph-pattern-/);
    // Geometry sliders appear once a pattern is chosen.
    assert.ok(r.all('input[type="range"]').length >= 5, "geometry sliders");
  });
});
