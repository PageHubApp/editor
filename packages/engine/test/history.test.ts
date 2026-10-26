import { test } from "node:test";
import assert from "node:assert/strict";
import { history, historyField, closeHistoryGroup } from "../src/history/history.ts";
import { defineCommand } from "../src/commands/defineCommand.ts";
import { createStore } from "../src/state/store.ts";
import { setSelection } from "../src/state/state.ts";
import { t } from "../src/schema/t.ts";

const P = "index.liquid";
const PAGE = `<section class="hero">\n  <h1 class="text-3xl">Hi</h1>\n  <p>Body</p>\n</section>\n`;
const T0 = 1_000_000;

const open = (extra: unknown[] = []) => createStore({ files: { [P]: PAGE }, extensions: [history(), ...(extra as never[])] });
const text = (s: ReturnType<typeof open>) => s.state.files.get(P)!;
const steps = (s: ReturnType<typeof open>) => s.state.field(historyField).done.length;

test("history: undo after three typed characters restores all three", () => {
  const s = open();
  const h1Text = s.find(P, "h1")[0]!.children()[0]!;
  ["Hi!", "Hi!!", "Hi!!!"].forEach((v, i) => s.dispatch((tr) => tr.setText(h1Text, v).annotate({ time: T0 + i * 100 })));
  assert.match(text(s), /Hi!!!/);
  assert.equal(steps(s), 1);
  assert.ok(s.undo());
  assert.equal(text(s), PAGE);
  assert.ok(h1Text.alive);
  assert.ok(s.redo());
  assert.match(text(s), /Hi!!!/);
});

test("history: typing groups until 500 ms idle or blur", () => {
  const s = open();
  const h = s.find(P, "h1")[0]!.children()[0]!;
  s.dispatch((tr) => tr.setText(h, "A").annotate({ time: T0 }));
  s.dispatch((tr) => tr.setText(h, "AB").annotate({ time: T0 + 400 }));
  s.dispatch((tr) => tr.setText(h, "ABC").annotate({ time: T0 + 1000 })); // idle > 500 ms
  assert.equal(steps(s), 2);
  s.dispatch((tr) => tr.effect(closeHistoryGroup, null)); // blur
  s.dispatch((tr) => tr.setText(h, "ABCD").annotate({ time: T0 + 1100 }));
  assert.equal(steps(s), 3);
  s.dispatch((tr) => tr.setText(h, "ABCDE").annotate({ time: T0 + 1150, history: "merge" }));
  assert.equal(steps(s), 3, "merge joins the previous step");
});

test("history: an accepted AI edit undoes in one step", () => {
  const s = open();
  s.dispatch((tr) => tr.setAttr(s.find(P, "p")[0]!, "class", "lead").annotate({ time: T0 }));
  const afterUser = text(s);
  s.dispatch((tr) =>
    tr
      .setAttr(s.find(P, "h1")[0]!, "class", "text-6xl")
      .insert({ after: s.find(P, "p")[0]! }, `<a href="/quote" class="btn">Get a quote</a>`)
      .annotate({ origin: "ai", time: T0 + 10 }),
  );
  s.dispatch((tr) => tr.setAttr(s.find(P, "a")[0]!, "class", "btn btn-primary").annotate({ origin: "ai", time: T0 + 20 }));
  assert.equal(steps(s), 3, "each accepted AI edit is its own step");
  assert.ok(s.undo());
  assert.ok(s.undo());
  assert.equal(text(s), afterUser);
  assert.ok(s.undo());
  assert.equal(text(s), PAGE);
  assert.equal(s.undo(), false);
});

test("history: a slider drag (20 transactions, one command) is one step", () => {
  const setSize = defineCommand({
    id: "classes.set",
    title: "Set size",
    args: t.object({ size: t.int() }),
    run: ({ state, tr, dispatch }, { size }) => {
      void state;
      dispatch?.(tr.setAttr(s.find(P, "h1")[0]!, "class", `text-[${size}px]`));
      return true;
    },
  });
  const s = open([setSize]);
  for (let i = 0; i < 20; i++) assert.ok(s.run(setSize, { size: 20 + i }));
  assert.match(text(s), /text-\[39px\]/);
  assert.equal(steps(s), 1);
  assert.ok(s.undo());
  assert.equal(text(s), PAGE);
});

test("history: a remote change between two user edits keeps undo correct", () => {
  const s = open();
  s.dispatch((tr) => tr.setAttr(s.find(P, "h1")[0]!, "id", "title").annotate({ time: T0 }));
  s.dispatch((tr) => tr.insert({ before: s.find(P, "section")[0]! }, "<header>remote</header>").annotate({ origin: "remote", time: T0 + 10 }));
  s.dispatch((tr) => tr.setAttr(s.find(P, "p")[0]!, "class", "lead").annotate({ time: T0 + 2000 }));
  assert.equal(steps(s), 2, "remote edits don't enter history");
  assert.ok(s.undo());
  assert.ok(s.undo());
  assert.equal(text(s), `<header>remote</header>\n${PAGE}`);
  assert.ok(s.redo());
  assert.ok(s.redo());
  assert.match(text(s), /<header>remote<\/header>\n<section class="hero">\n  <h1 class="text-3xl" id="title">Hi<\/h1>\n  <p class="lead">/);
});

test("history: selection effects and plugin edits never enter history", () => {
  const s = open();
  s.dispatch((tr) => tr.effect(setSelection, { handles: s.find(P, "h1") }));
  assert.equal(steps(s), 0);
  s.dispatch((tr) => tr.setAttr(s.find(P, "h1")[0]!, "id", "x").annotate({ origin: "plugin" }));
  s.dispatch((tr) => tr.setAttr(s.find(P, "p")[0]!, "id", "y").annotate({ history: false }));
  assert.equal(steps(s), 0);
  assert.equal(s.undo(), false);
  assert.equal(s.state.selection.handles.length, 1);
});
