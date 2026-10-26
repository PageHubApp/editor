import assert from "node:assert/strict";
import { test } from "node:test";
import { SECTIONS } from "../src/features/inspector/rows/build";
import { HOMES, PROPERTY_MAP, allNames, countByHome, escalated, newTailwindGroups } from "../src/property-map/propertyMap";
import { RUNTIME_IDS } from "../src/features/inspector/rows/runtime";

test("no duplicate keys or aliases", () => {
  const seen = new Map<string, string>();
  for (const e of PROPERTY_MAP) {
    for (const n of allNames(e)) {
      assert.ok(!seen.has(n), `"${n}" is used by both "${seen.get(n)}" and "${e.key}"`);
      seen.set(n, e.key);
    }
  }
});

test("every entry has a home, a known section, and the fields that home needs", () => {
  for (const e of PROPERTY_MAP) {
    assert.ok(HOMES.includes(e.home), `${e.key}: unknown home ${e.home}`);
    assert.ok(SECTIONS[e.section], `${e.key}: unknown section ${e.section}`);
    assert.equal(SECTIONS[e.section]![0], e.tab, `${e.key}: tab does not match its section`);
    assert.ok(e.components.length > 0 && e.does && e.how && e.binding, `${e.key}: missing a field`);
    if (e.home === "tailwind-class") assert.ok(e.group, `${e.key}: tailwind-class needs a group`);
    if (e.home === "escalate") assert.ok(e.reason, `${e.key}: escalate needs a reason`);
    if (e.runtime) assert.ok(RUNTIME_IDS.has(e.runtime), `${e.key}: unknown runtime id ${e.runtime}`);
  }
});

test("every NEW runtime attribute is used by a key; nothing is retired", () => {
  for (const id of RUNTIME_IDS) assert.ok(PROPERTY_MAP.some((e) => e.runtime === id), `runtime ${id} is unused`);
  assert.ok(!PROPERTY_MAP.some((e) => (e.home as string) === "retired"));
  const counts = countByHome();
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), PROPERTY_MAP.length);
  assert.ok(PROPERTY_MAP.length >= 211);
  assert.ok(escalated().length <= 5, "escalations should stay very few");
  assert.ok(newTailwindGroups().every((g) => g.keys.length > 0));
});
