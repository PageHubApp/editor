import { test } from "node:test";
import assert from "node:assert/strict";
import { Configuration, ConfigError, Prec, defineFacet } from "../src/extensions/extension.ts";
import { definePlugin } from "../src/extensions/plugin.ts";
import { commandsFacet, elementsFacet, keybindingsFacet, menusFacet, storageFacet, componentsFacet, panelsFacet } from "../src/extensions/facets.ts";
import { defineCommand } from "../src/commands/defineCommand.ts";
import { defineElement } from "../src/elements/defineElement.ts";
import { contributes } from "../src/commands/contributes.ts";

const list = defineFacet<string, readonly string[]>({ id: "test.list", combine: (v) => v });

test("extensions: nested arrays flatten depth-first, in order", () => {
  const c = Configuration.resolve([list.of("a"), [list.of("b"), [list.of("c")]], list.of("d")]);
  assert.deepEqual(c.facet(list), ["a", "b", "c", "d"]);
});

test("extensions: a duplicated plugin registers once", () => {
  const p = definePlugin({ name: "p", extensions: [list.of("p")] });
  const c = Configuration.resolve([p, [p], list.of("x"), p]);
  assert.deepEqual(c.facet(list), ["p", "x"]);
  assert.equal(c.plugins.length, 1);
});

test("extensions: Prec.highest wins over default (and lowest goes last)", () => {
  const c = Configuration.resolve([list.of("default"), Prec.lowest(list.of("lowest")), Prec.highest(list.of("highest")), Prec.high([list.of("high")])]);
  assert.deepEqual(c.facet(list), ["highest", "high", "default", "lowest"]);
  const a = defineElement({ name: "a", match: "div", props: {}, describe: "" });
  const b = defineElement({ name: "b", match: "div", props: {}, describe: "" });
  assert.deepEqual(Configuration.resolve([a, Prec.highest(b)]).facet(elementsFacet).map((e) => e.name), ["b", "a"]);
});

test("extensions: a facet collision error names both sources", () => {
  const cmd = (title: string) => defineCommand({ id: "element.duplicate", title, run: () => true });
  const one = definePlugin({ name: "kit-one", extensions: [cmd("A")] });
  const two = definePlugin({ name: "kit-two", extensions: [cmd("B")] });
  assert.throws(() => Configuration.resolve([one, two]), (e: Error) => e instanceof ConfigError && /element\.duplicate/.test(e.message) && /kit-one/.test(e.message) && /kit-two/.test(e.message));
  const el = (n: string) => defineElement({ name: "map", match: "div", props: {}, describe: n });
  assert.throws(() => Configuration.resolve([el("a"), definePlugin({ name: "maps", extensions: [el("b")] })]), /element "map" is registered twice: by \(root\) and by maps/);
  assert.throws(() => Configuration.resolve([storageFacet.of({}), storageFacet.of({})]), /only one storage/);
});

test("extensions: requires missing → config error; present → ok", () => {
  const base = definePlugin({ name: "tailwind" });
  const needs = definePlugin({ name: "colors", requires: [base] });
  assert.throws(() => Configuration.resolve([needs]), /plugin "colors" requires plugin "tailwind"/);
  assert.doesNotThrow(() => Configuration.resolve([base, needs]));
});

test("extensions: contributes registers data; runtime loads lazily", async () => {
  let loaded = 0;
  const p = definePlugin({
    name: "maps",
    runtime: async () => ((loaded++), { default: ["map-tag"] }),
    contributes: { menus: { "canvas/context": [{ command: "b", group: "edit@2" }, { command: "a", group: "edit@1" }, { command: "n", group: "navigation" }] } },
  });
  const c = Configuration.resolve([p]);
  assert.equal(loaded, 0);
  assert.deepEqual(c.facet(menusFacet)["canvas/context"]!.map((m) => m.command), ["n", "a", "b"]);
  assert.deepEqual(await c.loadRuntimes(), ["map-tag"]);
  assert.equal(loaded, 1);
});

test("extensions: core combine rules — commands by id, components override, panels by slot", () => {
  const cmd = defineCommand({ id: "x", title: "X", run: () => false });
  assert.equal(Configuration.resolve([cmd]).facet(commandsFacet).get("x"), cmd);
  const c = Configuration.resolve([componentsFacet.of({ Toolbar: "default", Layers: "default" }), Prec.high(componentsFacet.of({ Layers: null }))]);
  assert.deepEqual(c.facet(componentsFacet), { Toolbar: "default", Layers: null });
  const panels = Configuration.resolve([panelsFacet.of({ id: "b", slot: "inspector", order: 2 }), panelsFacet.of({ id: "a", slot: "inspector", order: 1 })]).facet(panelsFacet);
  assert.deepEqual(panels.inspector!.map((p) => p.id), ["a", "b"]);
  assert.equal(Configuration.resolve([]).facet(keybindingsFacet).length, 0);
  assert.throws(() => Configuration.resolve([{} as never]), /not an extension/);
  assert.ok(contributes);
});
