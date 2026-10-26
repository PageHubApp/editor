import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor, mountEditor, type EditorEvent } from "../src/index.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { fixtureEditor, render } from "./harness.tsx";
import { press } from "./keys.ts";

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

describe("embedding", () => {
  it("<Editor storage> opens a core from a plain object of files and honours role", async () => {
    let opened: unknown = null;
    const r = render(<Editor storage={{ "index.liquid": `<h1 data-editable="text">Hi</h1>` }} role="client" onReady={(e) => (opened = e)} />);
    assert.equal(r.all("[data-ph-editor-scope]").length, 0, "nothing renders while opening");
    await settle();
    assert.ok(opened);
    assert.equal(r.get("[data-ph-editor-scope]").getAttribute("data-role"), "client");
    assert.equal(r.all('[data-slot="LayersPanel"]').length, 0);
    r.unmount();
  });

  it("mountEditor renders into an element and unmount tears it down", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    let m!: ReturnType<typeof mountEditor>;
    await act(async () => void (m = mountEditor(el, { editor: fixtureEditor() })));
    assert.ok(el.querySelector(".pagehub-editor"));
    await act(async () => m.unmount());
    assert.equal(el.querySelector(".pagehub-editor"), null);
    el.remove();
  });

  it("onEvent reports selection, diff and saved", async () => {
    const e = fixtureEditor();
    const events: EditorEvent[] = [];
    const r = render(<Editor editor={e} onEvent={(ev) => events.push(ev)} />);
    await act(async () => e.select(e.get("h1")));
    assert.equal(events.at(-1)?.type, "selection");
    await act(async () => void e.dispatch((tr) => tr.setText(e.get("h1"), "Changed")));
    const diff = events.find((x) => x.type === "diff");
    assert.ok(diff && diff.type === "diff" && diff.files.length === 1);
    await act(async () => void (await e.save()));
    assert.deepEqual(events.find((x) => x.type === "saved"), { type: "saved", written: ["index.liquid"] });
    r.unmount();
  });

  it("two editors on one page: a key inside one reaches only that one", () => {
    const a = fixtureEditor();
    const b = fixtureEditor();
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    const [elA, elB] = [document.createElement("div"), document.createElement("div")];
    wrap.append(elA, elB);
    const [rootA, rootB] = [createRoot(elA), createRoot(elB)];
    act(() => {
      rootA.render(<Editor editor={a} platform="other" />);
      rootB.render(<Editor editor={b} platform="other" />);
    });
    const target = elA.querySelector<HTMLElement>("#toolbar")!;
    assert.equal(press("ctrl+shift+G", target), true);
    assert.equal(chromeOf(a.state).gridlines, true);
    assert.equal(chromeOf(b.state).gridlines, false);
    assert.equal(press("ctrl+shift+G", elB.querySelector<HTMLElement>("#toolbar")!), true);
    assert.equal(chromeOf(b.state).gridlines, true);
    assert.equal(chromeOf(a.state).gridlines, true, "A untouched by B's key");
    act(() => {
      rootA.unmount();
      rootB.unmount();
    });
    wrap.remove();
  });
});
