/** §1.6 Save at the core: queue, events, conflicts, and breakpoint widths in theme.css. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareWrite } from "@pagehub/engine";
import { htmlKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { SaveQueue } from "../../engine/src/editor/saveQueue.ts";
import { THEME_FILE, setThemeBreakpoint, themeBreakpoints, themeSetBreakpoint } from "../../engine/src/kits/tailwind/themeBreakpoints.ts";

const editor = (extra: unknown[] = []) => createTestEditor({ files: { "index.liquid": "<h1>Hi</h1>\n" }, extensions: [htmlKit(), ...(extra as never[])] });
const edit = (e: ReturnType<typeof editor>, text: string) => e.dispatch((tr) => tr.setText(e.get("h1"), text));

describe("save (1.6)", () => {
  it("no autosave timer: an edit only marks the file dirty; the host (or ⌘S) decides when to save", async () => {
    const e = editor();
    edit(e, "A");
    assert.deepEqual(e.dirty(), ["index.liquid"]);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(e.memory.writes, 0);
  });

  it("one save at a time; calls made meanwhile share ONE queued follow-up (paths merge)", async () => {
    const runs: Array<string[] | undefined> = [];
    let release!: () => void;
    const q = new SaveQueue<number>(async (paths) => {
      runs.push(paths);
      if (runs.length === 1) await new Promise<void>((r) => (release = r));
      return runs.length;
    });
    const a = q.request(["a"]);
    assert.equal(q.busy, true);
    const b = q.request(["b"]);
    const c = q.request(["c"]);
    assert.equal(b, c, "same queued promise");
    release();
    assert.deepEqual([await a, await b, await c], [1, 2, 2]);
    assert.deepEqual(runs, [["a"], ["b", "c"]]);
    assert.equal(q.busy, false);
  });

  it("saving / saved events; identical content is answered locally (no write, no events)", async () => {
    const e = editor();
    const seen: string[] = [];
    e.on("saving", () => seen.push("saving"));
    e.on("saved", () => seen.push("saved"));
    await e.save();
    assert.deepEqual(seen, []);
    edit(e, "B");
    await e.save();
    assert.deepEqual(seen, ["saving", "saved"]);
    assert.equal(e.memory.writes, 1);
    await e.save();
    assert.equal(e.memory.writes, 1);
  });

  it("the unsaved flag clears after a save only if nothing changed after that save's snapshot", async () => {
    const e = editor([prepareWrite("slow", async () => void (await new Promise((r) => setTimeout(r, 10))))]);
    edit(e, "C");
    const p = e.save();
    edit(e, "D");
    await p;
    assert.deepEqual(e.dirty(), ["index.liquid"], "edited while saving: stays dirty");
    await e.save();
    assert.deepEqual(e.dirty(), []);
  });

  it("blocked by rule errors → saveFailed (the banner explains it); storage errors → saveFailed and rethrown", async () => {
    const e = editor([prepareWrite("lint", () => ({ errors: ["unclosed tag"] }))]);
    const failed: unknown[] = [];
    e.on("saveFailed", (x) => failed.push(x));
    edit(e, "E");
    const r = await e.save();
    assert.equal(r.ok, false);
    assert.deepEqual(failed, [{ blocked: [{ path: "index.liquid", errors: ["lint: unclosed tag"] }], error: null }]);
    const f = editor();
    const offline = async () => {
      throw new Error("offline");
    };
    f.memory.write = offline; // a storage without `writeBatch` writes file by file
    f.memory.writeBatch = offline;
    const errs: unknown[] = [];
    f.on("saveFailed", (x) => errs.push(x.error));
    edit(f, "F");
    await assert.rejects(f.save(), /offline/);
    assert.match(String(errs[0]), /offline/);
  });

  it("conflict → `conflict` event; reload takes theirs, override writes ours over the newer version", async () => {
    const e = editor();
    const conflicts: string[] = [];
    e.on("conflict", (c) => conflicts.push(c.path));
    e.destroy(); // no watch rebase: the stale write must collide
    e.memory.external("index.liquid", "<h1>Theirs</h1>\n");
    edit(e, "Mine");
    assert.equal((await e.save()).ok, false);
    assert.deepEqual(conflicts, ["index.liquid"]);
    const kept = await e.resolveConflict("index.liquid", "override");
    assert.equal(kept.ok, true);
    assert.match(e.memory.snapshot()["index.liquid"]!, /Mine/);

    const g = editor();
    g.destroy();
    g.memory.external("index.liquid", "<h1>Theirs</h1>\n");
    edit(g, "Mine");
    await g.save();
    await g.resolveConflict("index.liquid", "reload");
    assert.equal(g.text(), "<h1>Theirs</h1>\n");
    assert.deepEqual(g.dirty(), []);
    assert.equal(g.conflicts.size, 0);
  });
});

describe("breakpoint widths live in theme.css", () => {
  it("reads --ph-bp-* (the variable the compiler reads), defaults otherwise", () => {
    const t = themeBreakpoints(":root {\n  --ph-bp-md: 800px;\n  --ph-bp-xl: 1300px;\n}\n");
    assert.deepEqual(t.values, { sm: 640, md: 800, lg: 1024, xl: 1300, "2xl": 1536 });
    assert.deepEqual(t.custom, { md: 800, xl: 1300 });
    assert.deepEqual(themeBreakpoints(undefined).custom, {});
  });

  it("does not read Tailwind's @theme --breakpoint-* nor an imported stylesheet's (Bootstrap) own", () => {
    assert.deepEqual(themeBreakpoints("@theme {\n  --breakpoint-md: 50rem;\n}\n").custom, {});
    assert.deepEqual(themeBreakpoints(":root{--breakpoint-sm:576px;--breakpoint-lg:992px;}").custom, {});
  });

  it("writes into the :root block, replaces in place, removes on reset", () => {
    assert.equal(setThemeBreakpoint("", "md", 800), ":root {\n  --ph-bp-md: 800px;\n}\n");
    const css = ":root {\n  --x: 1;\n}\n@theme {\n  --color-a: red;\n}\n";
    const added = setThemeBreakpoint(css, "lg", 1100);
    assert.equal(added, ":root {\n  --ph-bp-lg: 1100px;\n  --x: 1;\n}\n@theme {\n  --color-a: red;\n}\n");
    assert.equal(setThemeBreakpoint(added, "lg", 1200), added.replace("1100", "1200"));
    assert.equal(setThemeBreakpoint(added, "lg", null), css);
    assert.equal(setThemeBreakpoint("a{}", "xl", 1300), "a{}\n\n:root {\n  --ph-bp-xl: 1300px;\n}\n", "no :root yet: a new block, never @theme");
  });

  it("theme.setBreakpoint is one undo step and creates theme.css when missing", () => {
    const e = createTestEditor({ files: { "index.liquid": "<p>x</p>" }, extensions: [htmlKit(), themeSetBreakpoint] });
    assert.equal(e.run("theme.setBreakpoint", { breakpoint: "md", px: 800 }), true);
    assert.match(e.state.files.get(THEME_FILE)!, /--ph-bp-md: 800px;/);
    assert.equal(e.run("theme.setBreakpoint", { breakpoint: "md", px: 800 }), false, "no-op");
    e.run("history.undo");
    assert.equal(e.state.files.get(THEME_FILE) ?? "", "", "one undo step");
    e.run("history.redo");
    assert.equal(e.run("theme.setBreakpoint", { breakpoint: "md", px: null }), true);
    assert.doesNotMatch(e.state.files.get(THEME_FILE)!, /breakpoint/);
  });
});
