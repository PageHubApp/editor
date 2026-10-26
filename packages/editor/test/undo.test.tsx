import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyField } from "@pagehub/engine";
import { type Breakpoint } from "@pagehub/engine/kits";
import { chromeOf } from "../src/shell/chromeState.ts";
import { fixtureEditor } from "./harness.tsx";

const steps = (e: ReturnType<typeof fixtureEditor>) => e.state.field(historyField).done.length;

describe("undo / redo", () => {
  it("selection, zoom, grid lines, hidden toggle, panels, preview and the canvas view never enter history", () => {
    const e = fixtureEditor();
    e.select(e.get("h1"));
    for (const [id, args] of [["canvas.zoomSet", { zoom: 2 }], ["view.toggleGridlines"], ["view.toggleHidden"], ["panel.layers"], ["panel.media"], ["preview.toggle"], ["sidebar.search"], ["ui.set", { view: "md", dark: true }], ["canvas.zoomFit"]] as const) {
      assert.ok(e.run(id, args as never), id);
    }
    assert.equal(steps(e), 0);
    assert.equal(e.can("history.undo"), false);
  });

  it("panels stay open across undo and redo", () => {
    const e = fixtureEditor();
    e.select(e.get("h1"));
    e.run("element.duplicate");
    e.run("panel.layers");
    assert.equal(chromeOf(e.state).panel, "layers");
    e.undo();
    assert.equal(chromeOf(e.state).panel, "layers");
    e.redo();
    assert.equal(chromeOf(e.state).panel, "layers");
    assert.equal(e.find("index.liquid", "h1").length, 2);
  });

  it("undo of a delete restores the source byte for byte; redo deletes again; the canvas view and dark scope stay as they were", () => {
    const e = fixtureEditor();
    const before = e.text();
    e.run("ui.set", { view: "lg", dark: true });
    e.select(e.get("p"));
    e.run("element.remove");
    const after = e.text();
    assert.ok(e.run("history.undo"));
    assert.equal(e.text(), before);
    assert.equal(e.state.selection.primary, e.get("section"), "the parent the delete selected stays selected; nothing selected stays 'the page'");
    assert.ok(e.run("history.redo"));
    assert.equal(e.text(), after);
    assert.equal(e.state.field(historyField).done.length, 1);
  });

  it("reset-all-breakpoints is one step (the SDK made six)", () => {
    const e = fixtureEditor();
    const before = e.text();
    const layers = [{ token: null }, ...(["sm", "md", "lg", "xl", "2xl"] as Breakpoint[]).map((breakpoint) => ({ breakpoint, token: null }))];
    assert.ok(e.run("classes.layers", { group: "p", at: e.get("section"), layers }));
    assert.equal(steps(e), 1);
    assert.equal(e.get("section").attr("class"), "flex gap-2");
    e.undo();
    assert.equal(e.text(), before);
  });

  it("a conflict reload or load from storage is not an undo step: remote-origin changes rebase instead", () => {
    const e = fixtureEditor();
    e.select(e.get("p"));
    e.run("element.duplicate");
    e.dispatch((tr) => tr.setAttr(e.get("h1"), "class", "remote").annotate({ origin: "remote" }));
    assert.equal(steps(e), 1);
    e.undo();
    assert.match(e.text(), /<h1 class="remote">/, "undo leaves the remote change in place");
    assert.equal(e.find("index.liquid", "p").length, 1);
  });
});
