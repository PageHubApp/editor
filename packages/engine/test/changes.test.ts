import { test } from "node:test";
import assert from "node:assert/strict";
import { ChangeSet } from "../src/state/changes.ts";
import {
  insertSplices, removeSplices, moveSplices, replaceSplices, setTextSplices, setAttributeSplices, wrapSplices, setTagArgumentSplices,
  insert, move, remove, replace, setAttribute, setText, wrap, setTagArgument,
} from "../src/edit/ops.ts";
import { parseSource, allNodes, isLiquidBlock, NodeTypes, type LiquidBlockNode, type ElementNode } from "../src/index.ts";
import { SAMPLE, findEl, byTag, withAttr, nodesOf } from "./helpers.ts";

const P = "pages/index.liquid";
const files = new Map([[P, SAMPLE]]);
const h1 = findEl(SAMPLE, byTag("h1"));
const hero = findEl(SAMPLE, withAttr("data-section", "hero"));
const grid = findEl(SAMPLE, withAttr("id", "featured-grid"));
const forTag = nodesOf(SAMPLE).find((n): n is LiquidBlockNode => isLiquidBlock(n) && n.name === "for")!;
const text = (h1 as Extract<ElementNode, { children: unknown }>).children.find((c) => c.type === NodeTypes.TextNode)!;

const cases: Array<[string, ReturnType<typeof insertSplices>, string]> = [
  ["insert", insertSplices(SAMPLE, `<p>new</p>`, { anchor: hero, where: "after" }), insert(SAMPLE, `<p>new</p>`, { anchor: hero, where: "after" }).source],
  ["remove", removeSplices(SAMPLE, hero), remove(SAMPLE, hero).source],
  ["move", moveSplices(SAMPLE, h1, { parent: grid, where: "append" }).splices, move(SAMPLE, h1, { parent: grid, where: "append" }).source],
  ["replace", replaceSplices(h1, "<h1>Hi</h1>"), replace(SAMPLE, h1, "<h1>Hi</h1>").source],
  ["setText", setTextSplices(text, "A & B"), setText(SAMPLE, text, "A & B").source],
  ["setAttribute", setAttributeSplices(SAMPLE, h1, "class", "x"), setAttribute(SAMPLE, h1, "class", "x").source],
  ["wrap", wrapSplices(SAMPLE, hero, "{% if a %}", "{% endif %}"), wrap(SAMPLE, hero, "{% if a %}", "{% endif %}").source],
  ["setTagArgument", setTagArgumentSplices(SAMPLE, forTag as never, "limit", "4"), setTagArgument(SAMPLE, forTag as never, "limit", "4").source],
];

for (const [name, splices, expected] of cases) {
  test(`changes: ${name} — apply equals the edit op and invert round-trips byte-exact`, () => {
    const cs = ChangeSet.ofFile(P, splices);
    const next = cs.apply(files);
    assert.equal(next.get(P), expected);
    parseSource(next.get(P)!, "strict");
    assert.equal(cs.invert(files).apply(next).get(P), SAMPLE);
  });
}

test("changes: compose of two edits equals applying both", () => {
  const a = ChangeSet.ofFile(P, setAttributeSplices(SAMPLE, h1, "class", "big"));
  const mid = a.apply(files);
  const midHero = findEl(mid.get(P)!, withAttr("data-section", "hero"));
  const b = ChangeSet.ofFile(P, removeSplices(mid.get(P)!, findEl(mid.get(P)!, byTag("footer"))));
  const both = a.compose(b);
  assert.equal(both.apply(files).get(P), b.apply(mid).get(P));
  assert.equal(both.invert(files).apply(both.apply(files)).get(P), SAMPLE);
  assert.ok(midHero);
  // overlapping compose: insert, then edit inside the inserted text
  const s = new Map([[P, "abcdef"]]);
  const ins = ChangeSet.of([{ path: P, from: 3, to: 3, insert: "XYZ" }]);
  const del = ChangeSet.of([{ path: P, from: 2, to: 5, insert: "-" }]);
  assert.equal(ins.compose(del).apply(s).get(P), del.apply(ins.apply(s)).get(P));
  assert.deepEqual(ins.compose(del).changes, [{ path: P, from: 2, to: 3, insert: "-Z" }]);
});

test("changes: map with assoc -1 / 1 at an insertion point", () => {
  const cs = ChangeSet.of([{ path: P, from: 5, to: 5, insert: "abc" }]);
  assert.equal(cs.map(5, P, -1), 5);
  assert.equal(cs.map(5, P, 1), 8);
  assert.equal(cs.map(4, P), 4);
  assert.equal(cs.map(6, P), 9);
  const del = ChangeSet.of([{ path: P, from: 2, to: 6, insert: "x" }]);
  assert.equal(del.map(4, P, -1), 2);
  assert.equal(del.map(4, P, 1), 3);
  assert.equal(del.map(8, P), 5);
  assert.equal(del.mapRange(P, 2, 6)!.to, 3, "exact replacement keeps the range");
  assert.equal(ChangeSet.of([{ path: P, from: 1, to: 7, insert: "" }]).mapRange(P, 2, 6), null, "swallowed range is gone");
});

test("changes: changes in two files at once apply, invert and map per file", () => {
  const two = new Map([["a.liquid", "<p>a</p>"], ["b.liquid", "<p>b</p>"]]);
  const cs = ChangeSet.of([
    { path: "b.liquid", from: 3, to: 4, insert: "B" },
    { path: "a.liquid", from: 0, to: 0, insert: "<hr>" },
  ]);
  const next = cs.apply(two);
  assert.equal(next.get("a.liquid"), "<hr><p>a</p>");
  assert.equal(next.get("b.liquid"), "<p>B</p>");
  assert.deepEqual(cs.invert(two).apply(next), two);
  assert.equal(cs.map(3, "a.liquid"), 7);
  assert.equal(cs.map(3, "b.liquid"), 3);
  assert.deepEqual(cs.paths.sort(), ["a.liquid", "b.liquid"]);
});

test("changes: rebase maps a change past a concurrent one", () => {
  const s = new Map([[P, "0123456789"]]);
  const mine = ChangeSet.of([{ path: P, from: 8, to: 9, insert: "X" }]);
  const theirs = ChangeSet.of([{ path: P, from: 0, to: 0, insert: "ab" }]);
  assert.equal(mine.rebase(theirs).apply(theirs.apply(s)).get(P), "ab01234567X9");
  assert.ok(allNodes);
});
