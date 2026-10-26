import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../src/editor/createEditor.ts";
import { createTestEditor, CommandTester } from "../src/testing/index.ts";
import { memoryStorage } from "../src/storage/memory.ts";
import { defineCommand } from "../src/commands/defineCommand.ts";
import { historyField } from "../src/history/history.ts";
import { SAMPLE } from "./helpers.ts";

const P = "pages/index.liquid";
const PAGE = `<main>\n  <section class="hero">\n    <h1>Hello</h1>\n    <p>One</p>\n  </section>\n</main>\n`;

/** Duplicate the primary selection (a stand-in until the html kit lands). */
const duplicate = defineCommand({
  id: "test.duplicate",
  title: "Duplicate",
  run({ selection, tr, dispatch }) {
    const h = selection.primary;
    if (!h || h.kind !== "element") return false;
    if (dispatch) dispatch(tr.insert({ after: h }, h.text()).annotate({ command: "test.duplicate" }));
    return true;
  },
});

test("editor: a headless script edits through commands only; diff() shows the minimal change", () => {
  const ed = createTestEditor({ files: { [P]: SAMPLE }, extensions: [duplicate] });
  const h1 = ed.get("h1");
  ed.select(h1);
  assert.ok(ed.can(duplicate));
  assert.ok(ed.run(duplicate));
  const diff = ed.diff();
  // only additions: the duplicated element's lines, nothing else touched
  assert.equal(diff.split("\n").filter((l) => /^-[^-]/.test(l)).length, 0, diff);
  assert.equal(diff.split("\n").filter((l) => /^\+[^+]/.test(l)).length, h1.text().split("\n").length, diff);
  assert.ok(diff.includes(`+${SAMPLE.split("\n").find((l) => l.includes("<h1"))}`));
  assert.ok(ed.undo());
  assert.equal(ed.diff(), "");
  CommandTester.run(duplicate, [{ files: { [P]: PAGE }, select: "p", output: PAGE.replace("    <p>One</p>\n", "    <p>One</p>\n    <p>One</p>\n") }]);
});

test("editor: pendingDiff, save, and a no-op save writes nothing", async () => {
  const storage = memoryStorage({ [P]: PAGE });
  const ed = await createEditor({ storage });
  assert.deepEqual(ed.pendingDiff(), []);
  assert.deepEqual((await ed.save()).written, []);
  assert.equal(storage.writes, 0);
  ed.dispatch((tr) => tr.setAttr(ed.find(P, "h1")[0]!, "class", "big"));
  const [d] = ed.pendingDiff();
  assert.equal(
    d!.unified,
    `--- a/${P}\n+++ b/${P}\n@@ -1,6 +1,6 @@\n <main>\n   <section class="hero">\n-    <h1>Hello</h1>\n+    <h1 class="big">Hello</h1>\n     <p>One</p>\n   </section>\n </main>\n`,
  );
  const r = await ed.save();
  assert.deepEqual(r, { ok: true, written: [P], conflicts: [], blocked: [] });
  assert.equal(storage.snapshot()[P], PAGE.replace("<h1>", '<h1 class="big">'));
  assert.deepEqual(ed.pendingDiff(), []);
  assert.equal((await ed.save()).written.length, 0);
  assert.equal(storage.writes, 1);
  ed.destroy();
});

test("editor: a watched external edit arrives as a remote transaction, rebased over local edits", async () => {
  const storage = memoryStorage({ [P]: PAGE });
  const ed = await createEditor({ storage });
  const h1 = ed.find(P, "h1")[0]!;
  ed.dispatch((tr) => tr.setAttr(h1, "class", "big"));
  storage.external(P, PAGE.replace("<p>One</p>", "<p>Two</p>"));
  await ed.settled();
  assert.equal(ed.state.files.get(P), PAGE.replace("<h1>", '<h1 class="big">').replace("<p>One</p>", "<p>Two</p>"));
  assert.ok(h1.alive);
  assert.equal(ed.state.field(historyField).done.length, 1); // remote edits never enter history
  assert.ok(ed.undo());
  assert.equal(ed.state.files.get(P), PAGE.replace("<p>One</p>", "<p>Two</p>"));
  assert.ok(ed.redo());
  // the local edit saves on top of theirs
  assert.ok((await ed.save()).ok);
  assert.equal(storage.snapshot()[P], ed.state.files.get(P));
  ed.destroy();
});

test("editor: an overlapping remote edit is a conflict, never silent loss", async () => {
  const storage = memoryStorage({ [P]: PAGE });
  const ed = await createEditor({ storage });
  ed.dispatch((tr) => tr.setAttr(ed.find(P, "h1")[0]!, "class", "mine"));
  storage.external(P, PAGE.replace("<h1>", '<h1 class="theirs">'));
  await ed.settled();
  assert.match(ed.state.files.get(P)!, /class="mine"/);
  assert.match(ed.conflicts.get(P)!.theirs, /class="theirs"/);
  const r = await ed.save();
  assert.equal(r.ok, false);
  assert.match(r.conflicts[0]!.theirs, /class="theirs"/);
  assert.match(storage.snapshot()[P]!, /class="theirs"/);
  ed.destroy();
});

test("editor: persisted identity stamps ids on open, keeps them on save and re-finds them after a reload", async () => {
  let n = 0;
  const mint = () => `id${String(++n).padStart(4, "0")}`;
  const storage = memoryStorage({ [P]: PAGE, "partials/footer.liquid": "<footer><p>Foot</p></footer>\n" });
  const ed = await createEditor({ storage, identity: "persisted", mint });
  const h1 = ed.find(P, "h1")[0]!;
  const id = h1.id()!;
  assert.match(id, /^id\d{4}$/);
  assert.equal(ed.state.field(historyField).done.length, 0); // stamping is not an undo step
  ed.dispatch((tr) => tr.insert({ after: h1 }, "<h2>New</h2>"));
  assert.equal(ed.find(P, "h2")[0]!.id(), null); // minted on save
  assert.ok((await ed.save()).ok);
  const h2id = ed.find(P, "h2")[0]!.id()!;
  assert.ok(h2id);
  const all = Object.values(storage.snapshot()).flatMap((t) => [...t.matchAll(/data-edit-id="(\w+)"/g)].map((m) => m[1]));
  assert.equal(new Set(all).size, all.length, "ids are unique per site");
  ed.destroy();

  const again = await createEditor({ storage, identity: "persisted", mint });
  assert.deepEqual(again.pendingDiff(), []);
  assert.equal(again.findById(id)!.tag, "h1");
  assert.equal(again.findById(h2id)!.tag, "h2");
  assert.equal(again.findById("nope00"), null);
});

test("editor: session identity writes no data-edit- attribute anywhere", async () => {
  const storage = memoryStorage({ [P]: PAGE });
  const ed = await createEditor({ storage });
  ed.dispatch((tr) => tr.insert({ after: ed.find(P, "h1")[0]! }, "<h2>New</h2>"));
  await ed.save();
  assert.ok(!storage.snapshot()[P]!.includes("data-edit-"));
  assert.equal(ed.find(P, "h1")[0]!.id(), null);
});

test("editor: roles — client is content-only, viewer is read-only; describe() lists commands", async () => {
  const files = { [P]: `<h1 data-editable="text">Hi</h1>\n<p>Fixed</p>\n` };
  const client = createTestEditor({ files, role: "client" });
  assert.equal(client.dispatch((tr) => tr.setText(client.get("h1"), "Hello")), true);
  assert.equal(client.dispatch((tr) => tr.setText(client.get("p"), "Changed")), false);
  assert.match(client.lastVeto!.reason, /only editable content/);
  assert.equal((await client.save()).ok, true);
  assert.match(client.memory.snapshot()[P]!, /Hello/);

  const viewer = createTestEditor({ files, role: "viewer" });
  assert.equal(viewer.dispatch((tr) => tr.setText(viewer.get("h1"), "Hello")), false);
  const m = viewer.describe();
  assert.equal(m.role, "viewer");
  assert.ok(m.commands.some((c) => c.id === "history.undo"));
});

test("editor: a file with invalid HTML nesting opens repaired, is dirty, and says so; the stored text is untouched until save", async () => {
  const broken = `<ul>\n  <li data-edit-id="abc123"><p>x</p></p></li>\n</ul>\n`;
  const storage = memoryStorage({ [P]: broken });
  const ed = await createEditor({ storage });
  assert.equal(ed.state.files.get(P), `<ul>\n  <li data-edit-id="abc123"><p>x</p></li>\n</ul>\n`);
  assert.deepEqual(ed.dirty(), [P]);
  assert.equal(ed.repairs.length, 1);
  assert.equal(ed.repairs[0]!.path, P);
  assert.equal((await storage.read(P))!.text, broken);
  assert.deepEqual(ed.diagnostics.filter((d) => d.rule === "parse"), []);
  const res = await ed.save();
  assert.deepEqual(res.written, [P], JSON.stringify(res));
  assert.equal((await storage.read(P))!.text, ed.state.files.get(P));
});
