import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../src/editor/createEditor.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";
import { liquidKit } from "../src/kits/liquid/liquidKit.ts";
import { defineFilter } from "../src/runtime/defineFilter.ts";
import { onBatchComplete } from "../src/normalize/hooks.ts";

const P = "index.liquid";

test("rules in the editor: diagnostics after each dispatch that changed text", async () => {
  const e = await createEditor({ storage: { [P]: `<main>\n  <img src="a.png">\n</main>\n`, "data.json": "{" } });
  assert.deepEqual(e.diagnostics.map((d) => [d.rule, d.path]), [["img-alt", P]], "markup files only");
  const img = e.find(P, "img")[0]!;
  e.dispatch((tr) => tr.setAttr(img, "alt", "A"));
  assert.deepEqual(e.diagnostics, []);
});

test("rules in the editor: diagnostics are current inside onBatchComplete listeners order (before subscribers)", async () => {
  let seen = -1;
  const e = await createEditor({ storage: { [P]: `<p>x</p>\n` } });
  e.subscribe((s) => s.files, () => (seen = e.diagnostics.length));
  e.dispatch((tr) => tr.insert({ after: e.find(P, "p")[0]! }, `<img src="b.png">`));
  assert.equal(seen, 1);
});

test("rules on save: an error blocks the write; sanitize fixes are applied to the written text", async () => {
  const e = await createEditor({ storage: { [P]: `<p>x</p>\n` } });
  const p = e.find(P, "p")[0]!;
  e.dispatch((tr) => tr.insert({ after: p }, `<button onclick="go()" data-edit-src="x.liquid#1">Go</button>`));
  const ok = await e.save();
  assert.equal(ok.ok, true);
  // data-edit-src is never stored; the site's own handler is.
  assert.equal((await e.storage.read(P))!.text, `<p>x</p>\n<button onclick="go()">Go</button>\n`);
  assert.equal(e.state.files.get(P), `<p>x</p>\n<button onclick="go()">Go</button>\n`, "the editor holds what was written");
  e.dispatch((tr) => tr.insert({ after: e.find(P, "p")[0]! }, `{{ name | shout }}`));
  const r = await e.save();
  assert.equal(r.ok, false);
  assert.match(r.blocked[0]!.errors[0]!, /^rules: unknown-filter: unknown filter "shout" \(line 2/);
  assert.equal((await e.storage.read(P))!.text, `<p>x</p>\n<button onclick="go()">Go</button>\n`, "not written");
});

test("rules: the registry comes from the configured tags and filters (unknown-tag, unknown-filter, raw-only-trusted)", async () => {
  const shout = defineFilter({ name: "shout", returns: "string", describe: "Upper-case.", args: [], run: (v) => String(v).toUpperCase() });
  const badge = defineFilter({ name: "badge", returns: "html", describe: "A badge.", args: [], run: (v) => `<b>${v}</b>` });
  const src = `{{ a | shout }}\n{{ a | badge | raw }}\n{{ a | shout | raw }}\n{% foo %}\n{% include 'x' %}\n{% map lat: 1, lng: 2 %}{% endmap %}\n`;
  const e = await createEditor({ storage: { [P]: src }, extensions: [htmlKit(), liquidKit(), shout, badge] });
  const errs = e.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.rule}@${src.slice(0, d.range.start).split("\n").length}`);
  assert.deepEqual(errs.sort(), ["raw-only-trusted@3", "unknown-tag@4", "unknown-tag@5"]);
  const plain = await createEditor({ storage: { [P]: src } });
  assert.ok(plain.diagnostics.some((d) => d.rule === "unknown-filter" && d.message.includes("shout")));
});

test("rules: an editor configured without kits runs no rules", async () => {
  const e = await createEditor({ storage: { [P]: `<img src="a">` }, extensions: [onBatchComplete("noop", () => {})] });
  assert.deepEqual(e.diagnostics, []);
  assert.equal((await e.save()).ok, true);
});
