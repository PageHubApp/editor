/** Autosave at the core: debounce, flush, gestures, and the cases that must never loop (conflict, rule errors, failures). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autosave, prepareWrite, StorageError } from "@pagehub/engine";
import { htmlKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { saveSession } from "../src/features/save/saveSession.ts";
import { autosaveHeld, holdAutosave } from "../src/features/save/saveHolds.ts";

const FAST = { idleMs: 20, maxWaitMs: 300, minGapMs: 10, pausedRetryMs: 60 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const editor = (extra: unknown[] = []) => createTestEditor({ files: { "index.liquid": "<h1>Hi</h1>\n" }, extensions: [htmlKit(), ...(extra as never[])] });
const edit = (e: ReturnType<typeof editor>, text: string) => e.dispatch((tr) => tr.setText(e.get("h1"), text));
/** Count save attempts (a `saving` event per attempt that had files to write). */
const attempts = (e: ReturnType<typeof editor>) => {
  const n = { count: 0 };
  e.on("saving", () => n.count++);
  return n;
};

describe("autosave", () => {
  it("saves once after edits go quiet; a burst of edits is one write", async () => {
    const e = editor();
    const auto = autosave(e, FAST);
    edit(e, "A");
    edit(e, "AB");
    edit(e, "ABC");
    await wait(100);
    assert.equal(e.memory.writes, 0, "not before the editor's change debounce plus the idle time");
    await wait(700);
    assert.equal(e.memory.writes, 1);
    assert.match(e.memory.snapshot()["index.liquid"]!, /ABC/);
    assert.deepEqual(e.dirty(), []);
    auto.stop();
  });

  it("saves during continuous typing no later than maxWaitMs after the first edit", async () => {
    const e = editor();
    const auto = autosave(e, { ...FAST, idleMs: 5000, maxWaitMs: 700 });
    edit(e, "A");
    await wait(2000);
    assert.equal(e.memory.writes, 1, "idle never came; the max wait did");
    auto.stop();
  });

  it("flush saves right now, and asks buffered edits to commit first", async () => {
    const e = editor();
    let committed = 0;
    const auto = autosave(e, { ...FAST, idleMs: 60_000, beforeFlush: () => void committed++ });
    edit(e, "Z");
    const r = await auto.flush();
    assert.equal(r?.ok, true);
    assert.equal(committed, 1);
    assert.equal(e.memory.writes, 1);
    auto.stop();
  });

  it("waits while a gesture holds saving, then saves", async () => {
    const e = editor();
    let busy = true;
    const auto = autosave(e, { ...FAST, isBusy: () => busy });
    edit(e, "G");
    await wait(900);
    assert.equal(e.memory.writes, 0);
    busy = false;
    await wait(500);
    assert.equal(e.memory.writes, 1);
    auto.stop();
    const release = holdAutosave();
    assert.equal(autosaveHeld(), true);
    release();
    release();
    assert.equal(autosaveHeld(), false);
  });

  it("a conflict does not loop: one attempt, then nothing until it is settled", async () => {
    const e = editor();
    e.destroy(); // no watch rebase: the stale write must collide
    const n = attempts(e);
    const auto = autosave(e, FAST);
    e.memory.external("index.liquid", "<h1>Theirs</h1>\n");
    edit(e, "Mine");
    await wait(1500);
    assert.equal(n.count, 1);
    assert.equal(e.conflicts.size, 1);
    assert.equal(auto.unsaveable(), true);
    assert.equal(await auto.flush(), null, "a flush doesn't write over a conflict either");
    await e.resolveConflict("index.liquid", "override");
    assert.match(e.memory.snapshot()["index.liquid"]!, /Mine/);
    auto.stop();
  });

  it("a file a rule blocked is not retried until its text changes", async () => {
    const e = editor([prepareWrite("lint", () => ({ errors: ["unclosed tag"] }))]);
    const n = attempts(e);
    const auto = autosave(e, FAST);
    edit(e, "bad");
    await wait(1200);
    assert.equal(n.count, 1);
    assert.equal(e.memory.writes, 0);
    assert.equal(auto.unsaveable(), true);
    edit(e, "still bad");
    await wait(1200);
    assert.equal(n.count, 2, "new text, one new attempt");
    auto.stop();
  });

  it("maintenance is a pause: status 'paused', retried until the host lifts it", async () => {
    const e = editor();
    saveSession(e); // listens for the save events like the top bar does
    const real = e.memory.writeBatch!.bind(e.memory);
    let frozen = true;
    let calls = 0;
    e.memory.writeBatch = async (...args: Parameters<typeof real>) => {
      calls++;
      if (frozen) throw new StorageError("maintenance", "maintenance", { status: 503 });
      return real(...args);
    };
    const auto = autosave(e, FAST);
    edit(e, "M");
    await wait(1000);
    assert.equal(saveSession(e).get().status, "paused");
    assert.equal(e.memory.writes, 0);
    frozen = false;
    await wait(500);
    assert.equal(e.memory.writes, 1, "saved once the freeze lifted");
    assert.equal(saveSession(e).get().status, "saved");
    assert.ok(calls >= 2);
    auto.stop();
  });

  it("repeated network failures back off and stop; the next edit starts over", async () => {
    const e = editor();
    let calls = 0;
    e.memory.writeBatch = async () => {
      calls++;
      throw new StorageError("network", "offline");
    };
    e.memory.write = e.memory.writeBatch as never;
    const auto = autosave(e, FAST);
    edit(e, "N");
    await wait(1500);
    assert.equal(calls, 1, "the first retry waits 6s; no hammering");
    auto.stop();
  });

  it("a viewer never autosaves", async () => {
    const e = createTestEditor({ files: { "index.liquid": "<h1>Hi</h1>\n" }, extensions: [htmlKit()], role: "viewer" } as never);
    const auto = autosave(e, FAST);
    assert.equal(await auto.flush(), null);
    auto.stop();
  });
});
