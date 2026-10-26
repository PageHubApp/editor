import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { ToolbarItem } from "../src/features/toolbar/ToolbarItem.tsx";
import { countWrites, fixtureEditor, render, withEditor } from "./harness.tsx";
import { flush } from "./pickersHarness.tsx";

const live: ReturnType<typeof render>[] = [];
afterEach(() => live.splice(0).forEach((r) => r.unmount()));
const sectionClass = (e: ReturnType<typeof fixtureEditor>) => e.get("section").attr("class");
const key = (el: Element, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));



describe("ToolbarItem field types write on every change", () => {
  const row = (type: string, extra: object = {}) => {
    const e = fixtureEditor();
    const r = render(withEditor(e, <ToolbarItem prop="gap" label="Gap" type={type as "text"} {...extra} />));
    live.push(r);
    return { e, r };
  };
  it("text and textarea", async () => {
    const t = row("text");
    await t.r.type(t.r.get("input#input-gap"), "gap-4");
    assert.match(sectionClass(t.e)!, /gap-4/);
    const a = row("textarea");
    await a.r.type(a.r.all("textarea")[0]!, "gap-6");
    assert.match(sectionClass(a.e)!, /gap-6/);
  });
  it("slider steps through valueLabels", async () => {
    const { e, r } = row("slider", { valueLabels: ["gap-1", "gap-2", "gap-4"], max: 2 });
    await r.type(r.get("input[type=range]"), "2");
    assert.match(sectionClass(e)!, /gap-4/);
  });
  it("number and url types render their input type", () => {
    const n = row("number");
    assert.equal(n.r.get("input#input-gap").getAttribute("type"), "number");
    n.r.unmount();
    assert.equal(row("url").r.get("input#input-gap").getAttribute("type"), "url");
  });
});
