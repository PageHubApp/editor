import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlKit } from "../src/kits.ts";
import { createTestEditor } from "../src/testing/index.ts";

const PAGE = `<section class="intro"><h1 data-editable="text">Welcome</h1><p>Static</p></section>\n`;
const mk = (role: "client" | "owner" | "viewer") => createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit()], role });

test("client: only editable elements can be selected", () => {
  const e = mk("client");
  e.select(e.get("p"));
  assert.equal(e.state.selection.handles.length, 0);
  e.select(e.get("section"));
  assert.equal(e.state.selection.handles.length, 0);
  e.select(e.get("h1"));
  assert.equal(e.state.selection.primary?.tag, "h1");
});

test("client: remove / move / duplicate cannot run, dispatch nothing", () => {
  const e = mk("client");
  e.select(e.get("h1"));
  for (const id of ["element.remove", "element.duplicate", "element.moveDown", "element.wrap"]) {
    const args = id === "element.wrap" ? { tag: "div" } : undefined;
    assert.equal(e.can(id, args), false, id);
    assert.equal(e.run(id, args), false, id);
  }
  assert.equal(e.diff(), "");
});

test("client: an editable text edit can run", () => {
  const e = mk("client");
  const h1 = e.get("h1");
  assert.ok(e.dispatch((tr) => tr.setText(h1, "Hello")));
  assert.match(e.text(), /Hello/);
});

test("owner and viewer: owner can remove, viewer cannot", () => {
  const o = mk("owner");
  o.select(o.get("p"));
  assert.equal(o.can("element.remove"), true);
  const v = mk("viewer");
  v.select(v.get("p"));
  assert.equal(v.can("element.remove"), false);
  assert.equal(v.run("element.remove"), false);
  assert.equal(v.diff(), "");
});
