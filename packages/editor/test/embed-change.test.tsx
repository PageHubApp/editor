import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { act } from "react";
import { Editor, type EditorEvent } from "../src/index.ts";
import { fixtureEditor, render } from "./harness.tsx";

/** Advances the mocked clock, so the test never races the real 500ms quiet time under load. */
const tick = (ms: number) => act(async () => void mock.timers.tick(ms));

describe("embedding: debounced change", () => {
  it("onEvent: `change` fires once, 500ms after the last edit, with the dirty paths; `diff` still fires per edit", async () => {
    const e = fixtureEditor();
    const events: EditorEvent[] = [];
    const r = render(<Editor editor={e} onEvent={(ev) => events.push(ev)} />);
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      await act(async () => void e.dispatch((tr) => tr.setText(e.get("h1"), "One")));
      await tick(300);
      await act(async () => void e.dispatch((tr) => tr.setText(e.get("h1"), "Two")));
      await tick(300);
      assert.equal(events.filter((x) => x.type === "change").length, 0, "the second edit restarted the quiet time");
      assert.equal(events.filter((x) => x.type === "diff").length, 2);
      await tick(300);
      const changes = events.filter((x) => x.type === "change");
      assert.deepEqual(changes, [{ type: "change", dirty: ["index.liquid"] }]);
    } finally {
      mock.timers.reset();
      r.unmount();
    }
  });
});
