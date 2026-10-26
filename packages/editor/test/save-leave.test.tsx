import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "react";
import { LeaveDialog, hasUnsaved } from "../src/features/save/LeaveDialog.tsx";
import { fixtureEditor, render } from "./harness.tsx";

describe("leave without saving", () => {
  it("hasUnsaved follows the editor; LeaveDialog shows the copy with Leave / Stay (the host's router decides)", async () => {
    const e = fixtureEditor();
    assert.equal(hasUnsaved(e), false);
    await act(async () => void e.dispatch((tr) => tr.setText(e.get("h1"), "Changed")));
    assert.equal(hasUnsaved(e), true);
    const calls: string[] = [];
    const r = render(<LeaveDialog isOpen onLeave={() => calls.push("leave")} onStay={() => calls.push("stay")} />);
    const text = document.body.textContent ?? "";
    assert.match(text, /Leave without saving\?/);
    assert.match(text, /Your latest changes haven't saved yet\. If you leave now, they'll be lost\./);
    const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!;
    await r.click(button("Stay"));
    await r.click(button("Leave"));
    assert.deepEqual(calls, ["stay", "leave"]);
    r.unmount();
    await act(async () => void (await e.save()));
    assert.equal(hasUnsaved(e), false);
  });
});
