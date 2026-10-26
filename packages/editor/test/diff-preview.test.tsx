import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { htmlKit, liquidKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { DiffPanel, DiffPreview } from "../src/features/diff/DiffPreview.tsx";
import { diffLines } from "../src/features/diff/DiffView.tsx";
import { Editor } from "../src/index.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { fixtureEditor, render, withEditor, type Rendered } from "./harness.tsx";

const F = "index.liquid";
const SRC = `<ul>\n  {% for p in products %}\n    <li>{{ p.title }}</li>\n  {% endfor %}\n</ul>\n`;
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

const lines = () => [...document.querySelectorAll("[data-diff-line]")].map((n) => `${n.getAttribute("data-diff-line")}:${n.lastElementChild!.textContent}`);

describe("DiffPreview: the pendingDiff() view", () => {
  it("parses a unified diff into hunk / context / added / removed lines", () => {
    assert.deepEqual(diffLines("--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n"), [
      { kind: "hunk", text: "@@ -1,2 +1,2 @@" },
      { kind: "ctx", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "c" },
    ]);
  });

  it("shows nothing to save, then the exact pending diff after a panel command, then empties on save", async () => {
    const e = createTestEditor({ files: { [F]: SRC }, extensions: [htmlKit(), liquidKit()] });
    r = render(withEditor(e, <DiffPanel />));
    assert.ok(document.querySelector("[data-diff-empty]"));
    assert.equal((document.querySelector("[data-diff-save]") as HTMLButtonElement).disabled, true);

    e.select(e.get("%for"));
    act(() => void assert.ok(e.run("liquid.setArg", { name: "limit", value: "6" })));
    assert.equal(document.querySelector("[data-diff-file]")!.getAttribute("data-diff-file"), F);
    assert.match(document.querySelector("[data-diff-file] header")!.textContent!, /\+1 −1/);
    assert.deepEqual(lines(), [
      "hunk:@@ -1,5 +1,5 @@",
      "ctx:<ul>",
      "del:  {% for p in products %}",
      "add:  {% for p in products, limit: 6 %}",
      "ctx:    <li>{{ p.title }}</li>",
      "ctx:  {% endfor %}",
      "ctx:</ul>",
    ]);
    assert.equal(e.pendingDiff()[0]!.unified, e.diff(), "the view renders pendingDiff()");

    await r.click(document.querySelector("[data-diff-save]")!);
    await act(async () => void (await e.settled()));
    await act(async () => void (await new Promise((res) => setTimeout(res, 0))));
    assert.ok(document.querySelector("[data-diff-empty]"), "saved: nothing pending");
    assert.equal((await e.storage.read(F))!.text, e.text(), "written to storage");
  });
});

describe("DiffPreview slot: a dialog the diff.toggle command opens", () => {
  it("takes no room while closed; diff.toggle shows the pending diff in a dialog; diff.close hides it", async () => {
    const e = fixtureEditor();
    r = render(<Editor editor={e} platform="other" />);
    try {
      const dialog = () => document.body.querySelector('[role="dialog"][aria-label="Unsaved changes"]');
      assert.ok(document.querySelector('[data-slot="DiffPreview"]'), "the slot marker is always there");
      assert.equal(dialog(), null, "closed: nothing in the layout");
      assert.equal(document.querySelector("[data-diff-view]"), null);

      e.select(e.get("section"));
      act(() => void e.run("attr.set", { name: "id", value: "hero" }));
      act(() => void assert.ok(e.run("diff.toggle")));
      await act(async () => void (await new Promise((res) => setTimeout(res, 20))));
      assert.equal(chromeOf(e.state).diffOpen, true);
      assert.ok(dialog(), "open: the dialog");
      assert.ok(document.querySelector("[data-diff-file]"), "shows the pending diff");

      act(() => void assert.ok(e.run("diff.close")));
      assert.equal(chromeOf(e.state).diffOpen, false);
    } finally {
      r.unmount();
      resetOverlaysForTests();
      document.body.innerHTML = "";
    }
  });
});
