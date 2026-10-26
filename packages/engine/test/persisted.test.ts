import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, fingerprint } from "../src/identity/persisted.ts";

const seq = () => {
  let i = 0;
  return () => `n${String(++i).padStart(5, "0")}`;
};
const none = new Set<string>();

const PAGE = `<section>
  <h1>Welcome</h1>
  <p>First</p>
  <svg viewBox="0 0 1 1"><path d="M0"/></svg>
</section>
`;

test("persisted: minting stamps eligible elements only, after the last attribute", () => {
  const r = normalize(PAGE, null, { taken: none, mint: seq() });
  assert.equal(
    r.source,
    `<section data-edit-id="n00001">
  <h1 data-edit-id="n00002">Welcome</h1>
  <p data-edit-id="n00003">First</p>
  <svg viewBox="0 0 1 1" data-edit-id="n00004"><path d="M0"/></svg>
</section>
`,
  );
  assert.deepEqual(r.minted, ["n00001", "n00002", "n00003", "n00004"]);
});

test("persisted: idempotent; normalize(x, x) is a no-op", () => {
  const once = normalize(PAGE, null, { taken: none, mint: seq() }).source;
  assert.equal(normalize(once, null, { taken: none, mint: seq() }).source, once);
  assert.equal(normalize(once, once, { taken: none, mint: seq() }).source, once);
});

test("persisted: reconcile by position and by fingerprint after ids were lost", () => {
  const prev = normalize(PAGE, null, { taken: none, mint: seq() }).source;
  // an AI rewrite drops the ids on h1 and p, and reorders nothing → position match
  const lost = prev.replace(' data-edit-id="n00002"', "").replace(' data-edit-id="n00003"', "");
  const r = normalize(lost, prev, { taken: none, mint: () => "zzzzzz" });
  assert.equal(r.source, prev);
  assert.deepEqual(r.matched.filter((m) => m.by === "position").map((m) => m.id), ["n00002", "n00003"]);
  // moved paragraph (different index) keeps its id by fingerprint
  const moved = lost.replace("  <p>First</p>\n", "").replace("<h1>", "<p>First</p>\n  <h1>");
  const r2 = normalize(moved, prev, { taken: none, mint: () => "zzzzzz" });
  assert.match(r2.source, /<p data-edit-id="n00003">First<\/p>/);
  assert.ok(r2.matched.some((m) => m.id === "n00003" && m.by === "fingerprint"));
});

test("persisted: duplicates in file and ids taken elsewhere are reminted; invalid and ineligible stripped", () => {
  const src = `<div data-edit-id="aaaaaa"><p data-edit-id="aaaaaa">x</p><p data-edit-id="bbbbbb">y</p><b data-edit-id="cccccc">z</b><i data-edit-id="BAD">w</i></div>\n`;
  const r = normalize(src, null, { taken: new Set(["bbbbbb"]), mint: seq() });
  assert.equal(r.source, `<div data-edit-id="aaaaaa"><p data-edit-id="n00001">x</p><p data-edit-id="n00002">y</p><b>z</b><i>w</i></div>\n`);
  assert.deepEqual(r.reminted, [
    { duplicate: "aaaaaa", id: "n00001", reason: "duplicate-in-file" },
    { duplicate: "bbbbbb", id: "n00002", reason: "taken-elsewhere" },
  ]);
  assert.deepEqual(r.stripped, [
    { id: "cccccc", reason: "ineligible" },
    { id: "BAD", reason: "ineligible" },
  ]);
  const bad = normalize(`<p data-edit-id="BAD">w</p>\n`, null, { taken: none, mint: seq() });
  assert.equal(bad.source, `<p data-edit-id="n00001">w</p>\n`);
  assert.deepEqual(bad.stripped, [{ id: "BAD", reason: "invalid" }]);
});

test("persisted: ids inside Liquid blocks count toward the nearest element; head is ineligible", () => {
  const src = `<head><title data-edit-id="hhhhhh">T</title></head>\n<ul>{% for p in ps %}<li>{{ p.title }}</li>{% endfor %}</ul>\n`;
  const r = normalize(src, null, { taken: none, mint: seq() });
  assert.equal(r.source, `<head><title>T</title></head>\n<ul data-edit-id="n00001">{% for p in ps %}<li data-edit-id="n00002">{{ p.title }}</li>{% endfor %}</ul>\n`);
  assert.equal(fingerprint(`<li class="a">Hi {{ p.title }}  <b>There</b></li>`), "hi {{}} there");
});
