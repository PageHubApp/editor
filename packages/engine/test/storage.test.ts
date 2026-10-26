import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { memoryStorage } from "../src/storage/memory.ts";
import { fsStorage } from "../src/storage/fs.ts";
import { unifiedDiff, diffSplices } from "../src/storage/diff.ts";
import { applySplices } from "../src/edit/ops.ts";
import { EditIdConflictError } from "../src/identity/editIds.ts";
import type { StorageDef } from "../src/storage/defineStorage.ts";

async function roundTrip(s: StorageDef) {
  assert.deepEqual(await s.list(), ["pages/index.liquid"]);
  const r = await s.read("pages/index.liquid");
  assert.equal(r!.text, "<h1>Hi</h1>\n");
  const w = await s.write("pages/index.liquid", "<h1>Hello</h1>\n", { baseVersion: r!.version });
  assert.ok(w.ok);
  assert.equal((await s.read("pages/index.liquid"))!.text, "<h1>Hello</h1>\n");
  // stale version → conflict with their text; nothing overwritten
  const stale = await s.write("pages/index.liquid", "<h1>Mine</h1>\n", { baseVersion: r!.version });
  assert.equal(stale.ok, false);
  assert.equal(!stale.ok && stale.conflict.theirs, "<h1>Hello</h1>\n");
  assert.equal((await s.read("pages/index.liquid"))!.text, "<h1>Hello</h1>\n");
  // a new file needs baseVersion null
  assert.ok((await s.write("partials/footer.liquid", "<footer data-edit-id=\"abc123\"></footer>\n", { baseVersion: null })).ok);
  assert.equal((await s.write("partials/footer.liquid", "x", { baseVersion: null })).ok, false);
  assert.deepEqual([...(await s.editIds!("pages/index.liquid"))], ["abc123"]);
  assert.deepEqual([...(await s.editIds!("partials/footer.liquid"))], []);
  // ids are unique per site: the adapter re-checks on write
  const v = (await s.read("pages/index.liquid"))!.version;
  await assert.rejects(s.write("pages/index.liquid", `<h1 data-edit-id="abc123">x</h1>\n`, { baseVersion: v }), EditIdConflictError);
}

test("storage: memory adapter round-trips, conflicts on a stale version", async () => {
  await roundTrip(memoryStorage({ "pages/index.liquid": "<h1>Hi</h1>\n" }));
});

test("storage: fs adapter round-trips in a temp dir, conflicts on a stale version", async () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "phe-fs-"));
  try {
    fs.mkdirSync(nodePath.join(dir, "pages"));
    fs.mkdirSync(nodePath.join(dir, ".git"));
    fs.writeFileSync(nodePath.join(dir, ".git/HEAD"), "ref");
    fs.writeFileSync(nodePath.join(dir, "pages/index.liquid"), "<h1>Hi</h1>\n");
    const s = fsStorage({ root: dir });
    await roundTrip(s);
    assert.ok(fs.existsSync(nodePath.join(dir, "partials/footer.liquid")));
    assert.match((await s.read("pages/index.liquid"))!.version, /^\d+-\d+-[0-9a-f]{16}$/);
    await assert.rejects(s.read("../outside"), /escapes/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage: unified diff with 3 lines of context", () => {
  const a = ["<main>", "  <h1>Hi</h1>", "  <p>1</p>", "  <p>2</p>", "  <p>3</p>", "  <p>4</p>", "  <p>5</p>", "  <p>6</p>", "  <p>7</p>", "  <p>8</p>", "</main>", ""].join("\n");
  const b = a.replace("<h1>Hi</h1>", '<h1 class="big">Hi</h1>').replace("<p>8</p>", "<p>8</p>\n  <p>9</p>");
  assert.equal(
    unifiedDiff("pages/index.liquid", a, b),
    `--- a/pages/index.liquid
+++ b/pages/index.liquid
@@ -1,5 +1,5 @@
 <main>
-  <h1>Hi</h1>
+  <h1 class="big">Hi</h1>
   <p>1</p>
   <p>2</p>
   <p>3</p>
@@ -8,4 +8,5 @@
   <p>6</p>
   <p>7</p>
   <p>8</p>
+  <p>9</p>
 </main>
`,
  );
  assert.equal(unifiedDiff("x", a, a), "");
  assert.equal(unifiedDiff("x", "a", "b"), "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n");
});

test("storage: diffSplices turn one text into another", () => {
  const pairs = [
    ["a\nb\nc\n", "a\nB\nc\n"],
    ["a\nb\nc", "a\nb\nc\nd"],
    ["", "x\n"],
    ["x\ny\n", ""],
    ["1\n2\n3\n4\n", "0\n1\n3\n4\n5"],
  ];
  for (const [a, b] of pairs) assert.equal(applySplices(a!, diffSplices(a!, b!)), b);
  assert.deepEqual(diffSplices("a\nb\nc\n", "a\nB\nc\n"), [{ from: 2, to: 4, insert: "B\n" }]);
});
