import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { createEditor } from "../src/editor/createEditor.ts";
import { memoryStorage } from "../src/storage/memory.ts";
import { fsStorage } from "../src/storage/fs.ts";
import { defineStorage, type StorageDef } from "../src/storage/defineStorage.ts";
import { EditIdConflictError } from "../src/identity/editIds.ts";
import { StorageError, isStorageError, storageErrorFromResponse, storageErrorFromNetwork, STORAGE_ERROR_CODES } from "../src/storage/storageError.ts";

const A = "pages/a.liquid";
const B = "pages/b.liquid";
const FILES = { [A]: "<h1>A</h1>\n", [B]: "<h1>B</h1>\n" };

async function batchContract(s: StorageDef) {
  const [a, b] = [(await s.read(A))!, (await s.read(B))!];
  // all-or-nothing: one stale base → nothing is written, every conflicting path is reported
  const stale = await s.writeBatch!([{ path: A, text: "<h1>A2</h1>\n" }, { path: B, text: "<h1>B2</h1>\n" }], { baseVersions: { [A]: a.version, [B]: "nope" } });
  assert.equal(stale.ok, false);
  assert.deepEqual(!stale.ok && stale.conflicts.map((c) => c.path), [B]);
  assert.equal(!stale.ok && stale.conflicts[0]!.theirs, "<h1>B</h1>\n");
  assert.equal((await s.read(A))!.text, "<h1>A</h1>\n");
  // ok: new versions for every written file; a new file needs base null; a delete has no version
  const ok = await s.writeBatch!(
    [{ path: A, text: "<h1>A2</h1>\n" }, { path: "pages/c.liquid", text: "<h1>C</h1>\n" }, { path: B, delete: true }],
    { baseVersions: { [A]: a.version, "pages/c.liquid": null, [B]: b.version } },
  );
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && Object.keys(ok.versions).sort(), [A, "pages/c.liquid"]);
  assert.equal((await s.read(A))!.version, ok.ok && ok.versions[A]);
  assert.equal(await s.read(B), null);
  assert.equal((await s.read("pages/c.liquid"))!.text, "<h1>C</h1>\n");
  // an existing file with base null conflicts
  assert.equal((await s.writeBatch!([{ path: A, text: "x" }], { baseVersions: { [A]: null } })).ok, false);
  // ids stay unique across the batch itself
  await assert.rejects(
    s.writeBatch!([{ path: A, text: `<p data-edit-id="abc123"></p>` }, { path: "pages/d.liquid", text: `<p data-edit-id="abc123"></p>` }], { baseVersions: { [A]: ok.ok ? ok.versions[A]! : "", "pages/d.liquid": null } }),
    EditIdConflictError,
  );
  assert.equal((await s.read(A))!.text, "<h1>A2</h1>\n");
}

test("memoryStorage.writeBatch: atomic, deletes, one write", async () => {
  const s = memoryStorage(FILES);
  await batchContract(s);
  assert.equal(s.writes, 1);
});

test("fsStorage.writeBatch: atomic, deletes, no temp files left", async () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "batch-"));
  fs.mkdirSync(nodePath.join(dir, "pages"));
  for (const [p, t] of Object.entries(FILES)) fs.writeFileSync(nodePath.join(dir, p), t);
  const s = fsStorage({ root: dir });
  await batchContract(s);
  assert.deepEqual(fs.readdirSync(nodePath.join(dir, "pages")).sort(), ["a.liquid", "c.liquid"]);
  fs.rmSync(dir, { recursive: true });
});

test("editor: a multi-file save is one writeBatch; without writeBatch it falls back to a write per file", async () => {
  const batched = memoryStorage(FILES);
  const ed = await createEditor({ storage: batched });
  for (const p of [A, B]) ed.dispatch((tr) => tr.setAttr(ed.find(p, "h1")[0]!, "class", "x"));
  const r = await ed.save();
  assert.deepEqual(r.written.sort(), [A, B]);
  assert.equal(batched.writes, 1);
  assert.deepEqual(ed.dirty(), []);
  // the new versions are the base of the next save
  ed.dispatch((tr) => tr.setAttr(ed.find(A, "h1")[0]!, "class", "y"));
  assert.ok((await ed.save()).ok);
  ed.destroy();

  const inner = memoryStorage(FILES);
  const sequential = defineStorage({ id: "plain", list: inner.list, read: inner.read, write: inner.write, watch: inner.watch });
  const ed2 = await createEditor({ storage: sequential });
  for (const p of [A, B]) ed2.dispatch((tr) => tr.setAttr(ed2.find(p, "h1")[0]!, "class", "x"));
  assert.equal((await ed2.save()).written.length, 2);
  assert.equal(inner.writes, 2);
  ed2.destroy();
});

test("editor: a conflict on one file of a batch writes none of them", async () => {
  const storage = memoryStorage(FILES);
  const ed = await createEditor({ storage });
  for (const p of [A, B]) ed.dispatch((tr) => tr.setAttr(ed.find(p, "h1")[0]!, "class", "mine"));
  storage.external(B, "<h1 class=\"theirs\">B</h1>\n");
  await ed.settled();
  const r = await ed.save();
  assert.equal(r.ok, false);
  assert.deepEqual(r.written, []);
  assert.deepEqual(r.conflicts.map((c) => c.path), [B]);
  assert.equal(storage.snapshot()[A], FILES[A]);
  assert.deepEqual(ed.dirty().sort(), [A, B]);
  // keeping ours writes it, and the other file goes with the next save
  assert.ok((await ed.resolveConflict(B, "override")).ok);
  assert.match(storage.snapshot()[B]!, /mine/);
  ed.destroy();
});

test("editor: a StorageError thrown by writeBatch reaches saveFailed and keeps the draft", async () => {
  const inner = memoryStorage(FILES);
  const storage = defineStorage({
    id: "frozen",
    list: inner.list,
    read: inner.read,
    write: inner.write,
    writeBatch: async () => {
      throw new StorageError("maintenance", "503 maintenance", { status: 503, detail: "Editing is paused" });
    },
  });
  const ed = await createEditor({ storage });
  ed.dispatch((tr) => tr.setAttr(ed.find(A, "h1")[0]!, "class", "x"));
  const seen: unknown[] = [];
  ed.on("saveFailed", (e) => seen.push(e.error));
  await assert.rejects(ed.save(), (e) => isStorageError(e) && e.code === "maintenance" && e.retryable);
  assert.equal(seen.length, 1);
  assert.equal((seen[0] as StorageError).detail, "Editing is paused");
  assert.deepEqual(ed.dirty(), [A]);
  ed.destroy();
});

test("storageErrorFromResponse maps HTTP answers to codes", () => {
  const code = (status: number, body?: unknown) => storageErrorFromResponse(status, body).code;
  assert.equal(code(409), "conflict");
  assert.equal(code(409, { error: "site_format_changed" }), "format_changed");
  assert.equal(code(503, { error: "maintenance", message: "paused" }), "maintenance");
  assert.equal(storageErrorFromResponse(503, { error: "maintenance", message: "paused" }).detail, "paused");
  assert.equal(code(503), "network");
  assert.equal(code(502), "network");
  assert.equal(code(504), "network");
  assert.equal(code(401), "forbidden");
  assert.equal(code(403), "forbidden");
  assert.equal(code(404), "not-found");
  assert.equal(code(413), "too-large");
  assert.equal(code(500), "unknown");
  assert.equal(code(400, "text"), "unknown");
  assert.equal(storageErrorFromResponse(403).status, 403);
  assert.equal(storageErrorFromNetwork(new TypeError("fetch failed"), "write a").code, "network");
  const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
  assert.match(storageErrorFromNetwork(timeout, "list files").message, /did not answer in time/);
  assert.ok(STORAGE_ERROR_CODES.every((c) => new StorageError(c).code === c));
  assert.equal(new StorageError("forbidden").retryable, false);
  assert.equal(isStorageError(new Error("x")), false);
});
