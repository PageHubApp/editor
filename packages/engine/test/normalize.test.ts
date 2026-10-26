import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.ts";
import { TransactionBuilder } from "../src/state/builder.ts";
import { history, historyField } from "../src/history/history.ts";
import { afterTransaction, beforeTransaction, onBatchComplete } from "../src/normalize/hooks.ts";

const P = "index.liquid";
const PAGE = `<section>\n  <h1>Hi</h1>\n  <p>Body</p>\n</section>\n`;

test("normalize: a before hook vetoes a write", () => {
  const s = createStore({
    files: { [P]: PAGE },
    extensions: [beforeTransaction("no-h1-edits", (tr) => (tr.changes.paths.length && tr.annotations.command === "bad" ? { veto: "nope" } : undefined))],
  });
  const h1 = s.find(P, "h1")[0]!;
  let heard = 0;
  s.subscribe((st) => st.files, () => heard++);
  assert.equal(s.dispatch((tr) => tr.setAttr(h1, "class", "x").annotate({ command: "bad" })), false);
  assert.equal(s.state.files.get(P), PAGE);
  assert.deepEqual(s.lastVeto, { hook: "no-h1-edits", reason: "nope" });
  assert.equal(heard, 0);
  assert.equal(s.dispatch((tr) => tr.setAttr(h1, "class", "x")), true);
  assert.equal(s.lastVeto, null);
  assert.equal(heard, 1);
});

test("normalize: a before hook rewrites a transaction", () => {
  const s = createStore({
    files: { [P]: PAGE },
    extensions: [
      beforeTransaction("lowercase-classes", (tr, state) => {
        const v = tr.changes.changes.find((c) => /[A-Z]/.test(c.insert));
        if (!v) return;
        const b = new TransactionBuilder(state);
        for (const c of tr.changes.changes) b.replace({ path: c.path, from: c.from, to: c.to }, c.insert.toLowerCase());
        return b.annotate(tr.annotations).done();
      }),
    ],
  });
  s.dispatch((tr) => tr.setAttr(s.find(P, "h1")[0]!, "class", "BIG"));
  assert.match(s.state.files.get(P)!, /<h1 class="big">/);
});

test("normalize: an after hook appends in the same undo step; batch-complete runs once", () => {
  let batches = 0;
  const page = PAGE.replace("<p>", '<p class="prose">');
  const s = createStore({
    files: { [P]: page },
    extensions: [
      history(),
      // every <p> gets class="prose"
      afterTransaction("prose", (state) => {
        const b = new TransactionBuilder(state);
        const tree = state.tree(P);
        for (const n of tree.flat) {
          if (n.kind === "element" && n.tag === "p" && !state.files.get(P)!.slice(n.openTag.start, n.openTag.end).includes("prose")) {
            b.replace({ path: P, from: n.openTag.end - 1, to: n.openTag.end - 1 }, ` class="prose"`);
          }
        }
        return b.docChanged ? b : null;
      }),
      onBatchComplete("count", () => batches++),
    ],
  });
  s.dispatch((tr) => tr.insert({ append: s.find(P, "section")[0]! }, "<p>More</p>").annotate({ time: 1 }));
  const out = s.state.files.get(P)!;
  assert.equal(out.match(/class="prose"/g)?.length, 2);
  assert.equal(s.state.field(historyField).done.length, 1);
  assert.equal(batches, 1);
  assert.ok(s.undo());
  assert.equal(s.state.files.get(P), page);
});

test("normalize: the loop guard trips", () => {
  const s = createStore({
    files: { [P]: PAGE },
    extensions: [afterTransaction("forever", (state) => new TransactionBuilder(state).replace({ path: P, from: 0, to: 0 }, "x"))],
  });
  assert.throws(() => s.dispatch((tr) => tr.setAttr(s.find(P, "h1")[0]!, "id", "a")), /re-triggered more than 10 times/);
});

test("normalize: a hook may not dispatch", () => {
  let store: ReturnType<typeof createStore>;
  store = createStore({
    files: { [P]: PAGE },
    dev: true,
    extensions: [onBatchComplete("bad", () => store.dispatch((tr) => tr))],
  });
  assert.throws(() => store.dispatch((tr) => tr.setAttr(store.find(P, "h1")[0]!, "id", "a")), /normalization hook/);
});
