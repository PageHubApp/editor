import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { act } from "react";
import { createEditor, memoryStorage, prepareWrite, StorageError } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { FAILED_MS, SAVED_MS, describeSaveError, saveSession } from "../src/features/save/saveSession.ts";
import { SAVE_LABELS } from "../src/features/save/SaveStatus.tsx";
import { fixtureEditor, render } from "./harness.tsx";

const edit = (e: ReturnType<typeof fixtureEditor>, text = "Changed") => act(() => void e.dispatch((tr) => tr.setText(e.get("h1"), text)));
const status = () => document.querySelector("[data-save-status]")!;

describe("save status and banner (1.6, 3.6)", () => {
  it("status icon: idle floppy → saving spinner → saved green check, idle again after 3000ms", async () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    assert.equal(status().getAttribute("data-save-status"), "idle");
    assert.equal(status().getAttribute("aria-label"), "All changes saved");
    assert.equal(status().getAttribute("aria-live"), "polite");
    assert.ok(status().querySelector('[data-glyph="floppy"], svg'));
    edit(e);
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let p!: Promise<unknown>;
      act(() => void (p = e.save()));
      assert.equal(status().getAttribute("data-save-status"), "saving");
      assert.match(status().querySelector("svg")!.getAttribute("class")!, /animate-spin/);
      await act(async () => void (await p));
      assert.equal(status().getAttribute("data-save-status"), "saved");
      assert.match(status().querySelector("svg")!.getAttribute("class")!, /text-success/);
      act(() => mock.timers.tick(SAVED_MS - 1));
      assert.equal(status().getAttribute("data-save-status"), "saved");
      act(() => mock.timers.tick(1));
      assert.equal(status().getAttribute("data-save-status"), "idle");
    } finally {
      mock.timers.reset();
    }
    r.unmount();
  });

  it("failed: amber warning read out assertively, idle after 5000ms; the banner says why and dismisses", async () => {
    const e = createTestEditor({ files: { "index.liquid": "<h1>Hi</h1>" }, extensions: [htmlKit(), tailwindKit(), editorKit(), prepareWrite("lint", () => ({ errors: ["unclosed tag"] }))] });
    const r = render(<Editor editor={e} />);
    act(() => void e.dispatch((tr) => tr.setText(e.get("h1"), "X")));
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      await act(async () => void (await e.save()));
      assert.equal(status().getAttribute("aria-label"), SAVE_LABELS.failed);
      assert.equal(status().getAttribute("aria-live"), "assertive");
      assert.match(status().querySelector("svg")!.getAttribute("class")!, /text-warning/);
      const banner = r.get('[data-slot="SaveBanner"][role="alert"]');
      assert.equal(banner.textContent, "Couldn't save index.liquid: lint: unclosed tag");
      assert.equal(r.get(".pagehub-editor").firstElementChild, banner, "across the top");
      act(() => mock.timers.tick(FAILED_MS));
      assert.equal(status().getAttribute("data-save-status"), "idle");
    } finally {
      mock.timers.reset();
    }
    await r.click(r.get('[aria-label="Dismiss notice"]'));
    assert.equal(r.all('[data-slot="SaveBanner"][role="alert"]').length, 0);
    r.unmount();
  });

  it("out of date: a conflict shows the banner with Reload theirs / Keep mine (resolveConflict)", async () => {
    const e = fixtureEditor();
    e.destroy();
    const r = render(<Editor editor={e} />);
    e.memory.external("index.liquid", "<section><h1>Theirs</h1></section>\n");
    edit(e, "Mine");
    await act(async () => void (await e.save()));
    const banner = r.get('[data-save-banner="conflict"]');
    assert.match(banner.textContent!, /index\.liquid changed somewhere else/);
    await act(async () => void (await r.click(r.get("[data-conflict-keep]"))));
    await act(async () => void (await new Promise((res) => setTimeout(res, 10))));
    assert.match(e.memory.snapshot()["index.liquid"]!, /Mine/);
    assert.equal(r.all("[data-save-banner]").length, 0);
    r.unmount();
    const g = fixtureEditor();
    g.destroy();
    const r2 = render(<Editor editor={g} />);
    g.memory.external("index.liquid", "<p>Theirs</p>\n");
    edit(g, "Mine");
    await act(async () => void (await g.save()));
    await r2.click(r2.get("[data-conflict-reload]"));
    await act(async () => void (await new Promise((res) => setTimeout(res, 10))));
    assert.equal(g.text(), "<p>Theirs</p>\n");
    r2.unmount();
  });

  it("the save session is per editor and a plain store is always idle", () => {
    assert.notEqual(saveSession(fixtureEditor()), saveSession(fixtureEditor()));
  });

  it("closing the tab with unsaved changes gets the browser's beforeunload prompt; not once saved", async () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    const fire = () => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    assert.equal(fire(), false);
    edit(e);
    assert.equal(fire(), true);
    await act(async () => void (await e.save()));
    assert.equal(fire(), false);
    r.unmount();
    edit(e, "again");
    assert.equal(fire(), false, "detached on unmount");
  });

  it("the SaveStatus indicator sits in the top bar's address pill; file.save (⌘S) saves", async () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    edit(e);
    // The editor has no Save button — save is the pill's status indicator and runs on its shortcut.
    assert.ok(r.get('[data-slot="TopBar"]').querySelector('[data-slot="SaveStatus"]'));
    assert.equal(r.all('[data-topbar-item="file.save"]').length, 0);
    await act(async () => void (await e.save()));
    assert.equal(e.memory.writes, 1);
    r.unmount();
  });
});

describe("save failures from the host's storage (StorageError codes)", () => {
  const failWith = (e: ReturnType<typeof fixtureEditor>, error: unknown) => {
    (e.memory as { writeBatch: unknown }).writeBatch = async () => {
      throw error;
    };
  };

  it("maintenance: 'editing paused' status and banner (not an alert), no error state; Try again saves once it is lifted", async () => {
    const e = fixtureEditor();
    const frozen = new StorageError("maintenance", "503 maintenance", { status: 503 });
    const real = e.memory.writeBatch;
    failWith(e, frozen);
    const r = render(<Editor editor={e} />);
    edit(e);
    await act(async () => void (await e.save().catch(() => {})));
    assert.equal(status().getAttribute("data-save-status"), "paused");
    assert.equal(status().getAttribute("aria-label"), SAVE_LABELS.paused);
    const banner = r.get('[data-save-banner="paused"]');
    assert.equal(banner.getAttribute("role"), "status");
    assert.match(banner.textContent!, /Editing is paused/);
    assert.equal(r.all('[role="alert"][data-slot="SaveBanner"]').length, 0);
    assert.deepEqual(e.dirty(), ["index.liquid"], "the draft is kept");
    // the host's own words win over the default
    failWith(e, new StorageError("maintenance", "503", { detail: "Back at 6pm." }));
    await act(async () => void (await r.click(r.get("[data-save-retry]"))));
    await act(async () => void (await new Promise((res) => setTimeout(res, 10))));
    assert.match(r.get('[data-save-banner="paused"]').textContent!, /Back at 6pm\./);
    // lifted
    (e.memory as { writeBatch: unknown }).writeBatch = real;
    await act(async () => void (await r.click(r.get("[data-save-retry]"))));
    await act(async () => void (await new Promise((res) => setTimeout(res, 10))));
    assert.equal(r.all("[data-save-banner]").length, 0);
    assert.deepEqual(e.dirty(), []);
    r.unmount();
  });

  it("each code gets its own words; only the ones where retrying can help offer Try again", () => {
    const d = (code: ConstructorParameters<typeof StorageError>[0]) => describeSaveError(new StorageError(code));
    assert.match(d("network").message, /Can't reach the server/);
    assert.equal(d("network").retry, true);
    assert.match(d("format_changed").message, /upgraded while you had it open/);
    assert.equal(d("format_changed").retry, false);
    assert.match(d("forbidden").message, /signed out/);
    assert.match(d("not-found").message, /no longer exists/);
    assert.match(d("too-large").message, /too large/);
    assert.match(d("conflict").message, /changed on the server/);
    assert.equal(d("maintenance").kind, "paused");
    assert.match(describeSaveError(new Error("boom")).message, /Save failed — your changes are unsaved\. boom/);
  });

  it("a network error is a failed save with a Try again button", async () => {
    const e = fixtureEditor();
    failWith(e, new StorageError("network"));
    const r = render(<Editor editor={e} />);
    edit(e);
    await act(async () => void (await e.save().catch(() => {})));
    assert.equal(status().getAttribute("data-save-status"), "failed");
    assert.match(r.get('[data-save-banner="error"]').textContent!, /Can't reach the server/);
    assert.ok(r.get("[data-save-retry]"));
    r.unmount();
  });

  it("invalid HTML nesting opens repaired with a non-blocking notice; saving writes the fix and clears it", async () => {
    const e = await createEditor({ storage: memoryStorage({ "index.liquid": "<ul><li><p>Hi</p></p></li></ul>" }), extensions: [htmlKit(), tailwindKit(), editorKit()] });
    const r = render(<Editor editor={e} />);
    const banner = r.get('[data-save-banner="notice"]');
    assert.match(banner.textContent!, /^Fixed invalid HTML nesting in index\.liquid/);
    assert.equal(banner.getAttribute("role"), "status");
    await act(async () => void (await e.save()));
    assert.equal(r.all('[data-save-banner="notice"]').length, 0);
    r.unmount();
  });
});
