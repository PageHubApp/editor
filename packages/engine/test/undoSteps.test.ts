import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { tailwindKit } from "../src/kits/tailwind/tailwindKit.ts";
import { memoryClipboard } from "../src/kits/html/clipboard.ts";
import { historyField } from "../src/history/history.ts";
import { setSelection } from "../src/state/state.ts";

const P = "p.html";
const PAGE = `<section class="flex p-4">\n  <h2>A</h2>\n  <p class="p-2 md:p-4">One</p>\n</section>\n`;
const T0 = 2_000_000;
const ed = () => createTestEditor({ files: { [P]: PAGE }, extensions: [htmlKit({ clipboard: memoryClipboard() }), tailwindKit()] });
const steps = (e: ReturnType<typeof ed>) => e.state.field(historyField).done.length;
/** A class write the way a control makes one: a transaction stamped with its command and a time. */
const write = (e: ReturnType<typeof ed>, cls: string, time: number, extra: object = {}) =>
  e.dispatch((tr) => tr.setAttr(e.get("p"), "class", cls).annotate({ command: "classes.set", time, ...extra }));

test("steps: writes of one command less than 500 ms apart (a width / padding / gap drag) are one step; a later write is another", () => {
  const e = ed();
  for (let i = 0; i < 12; i++) write(e, `p-${i + 3}`, T0 + i * 30);
  assert.equal(steps(e), 1);
  write(e, "p-1", T0 + 2000);
  assert.equal(steps(e), 2);
  e.undo();
  assert.match(e.text(), /class="p-14"/, "undo reverts the last write only");
  e.undo();
  assert.match(e.text(), /class="p-2 md:p-4"/, "and the whole drag in one more step");
});

test("steps: a commit that names its own group is a step of its own, even right after the same command", () => {
  const e = ed();
  write(e, "p-3", T0, { group: Symbol("commit") });
  write(e, "p-5", T0 + 10, { group: Symbol("commit") });
  write(e, "p-6", T0 + 20);
  assert.equal(steps(e), 3, "two grouped commits and an ungrouped write never merge");
});

test("steps: one command that writes several nodes is one step (paste classes, duplicate, cut, paste, delete); copying is none", () => {
  const e = ed();
  /** Select `sel` (nth match), run `id`, return how many history steps it added. */
  const added = (sel: string, nth: number, id: string) => {
    e.select(e.find(P, sel)[nth]!);
    const before = steps(e);
    assert.ok(e.run(id), id);
    return steps(e) - before;
  };
  assert.equal(added("section", 0, "classes.copy"), 0);
  assert.equal(added("p", 0, "classes.paste"), 1);
  assert.equal(added("p", 0, "element.duplicate"), 1);
  assert.equal(added("p", 1, "element.cut"), 1);
  assert.equal(added("h2", 0, "element.paste"), 1);
  assert.equal(added("p", 1, "element.remove"), 1);
});

test("merge: a write annotated history:\"merge\" joins the previous step however late it comes (the follow-up writes of one gesture)", () => {
  const e = ed();
  write(e, "p-3", T0);
  write(e, "p-5", T0 + 5000, { history: "merge" });
  e.dispatch((tr) => tr.setAttr(e.get("h2"), "class", "x").annotate({ command: "classes.set", time: T0 + 9000, history: "merge" }));
  assert.equal(steps(e), 1);
  e.undo();
  assert.equal(e.text(), PAGE, "one undo reverts all three writes, in two nodes");
});

test("excluded: remote, plugin and history:false edits, selection and other session effects never become undo steps", () => {
  const e = ed();
  e.dispatch((tr) => tr.setAttr(e.get("p"), "class", "r").annotate({ origin: "remote", time: T0 }));
  e.dispatch((tr) => tr.setAttr(e.get("p"), "class", "pl").annotate({ origin: "plugin", time: T0 }));
  e.dispatch((tr) => tr.setAttr(e.get("p"), "class", "nh").annotate({ history: false, time: T0 }));
  e.dispatch((tr) => tr.effect(setSelection, { handles: [e.get("h2")] }));
  assert.equal(steps(e), 0);
  assert.equal(e.can("history.undo"), false);
  assert.match(e.text(), /class="nh"/);
});

test("canUndo / canRedo are the commands' can(): false on a fresh editor, true after an edit, redo true after an undo", () => {
  const e = ed();
  assert.equal(e.can("history.undo"), false);
  assert.equal(e.can("history.redo"), false);
  e.select(e.get("p"));
  e.run("element.duplicate");
  assert.equal(e.can("history.undo"), true);
  assert.equal(e.can("history.redo"), false);
  e.run("history.undo");
  assert.equal(e.can("history.undo"), false);
  assert.equal(e.can("history.redo"), true);
  e.select(e.get("p"));
  e.run("element.duplicate");
  assert.equal(e.can("history.redo"), false, "a new edit clears redo");
  assert.equal(e.press("mod+z", { ui: { textEditing: true } }).handled, false, "typing keeps the field's own undo");
});
