import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { setUi } from "../src/state/uiState.ts";
import { inspector, pageEditor, select } from "./inspectorFixture.tsx";

afterEach(() => localStorage.clear());

describe("non-class properties ignore the breakpoint scope", () => {
  it("an attribute row writes the attribute once, whatever the canvas view and multi-scope; no class is touched", async () => {
    const e = pageEditor({ "index.liquid": `<img src="a.png" alt="old" class="w-10">\n` });
    select(e, "img");
    act(() => void e.dispatch((tr) => tr.effect(setUi, { view: "md", multiScope: ["md", "xl"] })));
    const r = inspector(e);
    const input = r.get<HTMLInputElement>('[data-row="alt"] input');
    await r.type(input, "A photo");
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    await act(async () => void (await new Promise((res) => setTimeout(res, 260))));
    assert.equal(e.get("img").attr("alt"), "A photo", "one attribute, no md: / xl: copies");
    assert.equal(e.get("img").attr("class"), "w-10");
    assert.equal(e.state.files.get("index.liquid")!.match(/alt=/g)?.length, 1);
    r.unmount();
  });
});
