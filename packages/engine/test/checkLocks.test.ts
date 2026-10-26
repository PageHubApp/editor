import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLockChanges } from "../src/content/checkLocks.ts";

const P = "pages/index.liquid";
const PAGE = `<main>
<header data-edit-id="hdr001" data-edit-lock="delete drag"><h1>Logo</h1></header>
<section data-edit-lock="move-out" class="row"><p>One</p><p>Two</p><div class="x">Three</div></section>
<section data-edit-lock="sealed" data-edit-name="Legal"><p>Terms</p></section>
<section class="free"><p>Free</p></section>
</main>
`;

const ok = (next: string, prev = PAGE) => checkLockChanges({ [P]: prev }, { [P]: next });
const refused = (next: string, re: RegExp, prev = PAGE) => {
  const r = checkLockChanges({ [P]: prev }, { [P]: next });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, re);
    assert.equal(r.path, P);
  }
};

test("no locks, or an unchanged file: always ok", () => {
  assert.deepEqual(checkLockChanges({ [P]: "<p>a</p>" }, { [P]: "" }), { ok: true });
  assert.deepEqual(ok(PAGE), { ok: true });
});

test("editing text and attributes of locked elements is fine", () => {
  assert.deepEqual(ok(PAGE.replace("Logo", "Brand").replace('class="row"', 'class="row gap-4"')), { ok: true });
});

test("editing unlocked elements, and removing them, is fine", () => {
  assert.deepEqual(ok(PAGE.replace('<section class="free"><p>Free</p></section>\n', "")), { ok: true });
});

test("removing a delete-locked element is refused and names it", () => {
  refused(PAGE.replace(/<header[\s\S]*?<\/header>\n/, ""), /<header data-edit-id="hdr001"> is locked \(data-edit-lock="delete drag"\)/);
});

test("removing a sealed element is refused", () => {
  refused(PAGE.replace(/<section data-edit-lock="sealed"[\s\S]*?<\/section>\n/, ""), /Legal/);
});

test("removing a locked element together with its ancestor is refused", () => {
  const wrapped = `<div class="w">${PAGE}</div>`;
  refused(`<div class="w"><p>gone</p></div>`, /locked/, wrapped);
});

test("deleting the file that holds a locked element is refused", () => {
  const r = checkLockChanges({ [P]: PAGE }, {});
  assert.equal(r.ok, false);
});

test("clearing a lock is refused (it would be the way round the others)", () => {
  refused(PAGE.replace(' data-edit-lock="delete drag"', ""), /can't be removed or unlocked/);
  refused(PAGE.replace('data-edit-lock="delete drag"', 'data-edit-lock="drag"'), /can't be removed or unlocked/);
  refused(PAGE.replace('data-edit-lock="move-out"', 'data-edit-lock="delete"'), /move-out lock can't be cleared/);
});

test("adding a lock is fine", () => {
  assert.deepEqual(ok(PAGE.replace('<section class="free">', '<section class="free" data-edit-lock="delete">')), { ok: true });
});

test("a drag-locked element moved under another parent is refused", () => {
  const moved = PAGE.replace(/<header[\s\S]*?<\/header>\n/, "").replace('<p>Free</p>', '<p>Free</p><header data-edit-id="hdr001" data-edit-lock="delete drag"><h1>Logo</h1></header>');
  refused(moved, /can't be moved to another parent/);
});

test("reordering a drag-locked element within its parent is not detected as a move", () => {
  const swapped = PAGE.replace(/(<header[\s\S]*?<\/header>\n)([\s\S]*?)(<\/main>)/, "$2$1$3");
  assert.deepEqual(ok(swapped), { ok: true });
});

test("a child moved out of a move-out parent is refused", () => {
  const moved = PAGE.replace("<p>One</p>", "").replace("<p>Free</p>", "<p>Free</p><p>One</p>");
  refused(moved, /a child \(p\) can't be moved out/);
});

test("a child of a move-out parent that is deleted (not relocated) is fine", () => {
  assert.deepEqual(ok(PAGE.replace("<p>One</p>", "")), { ok: true });
});

test("a child of a move-out parent may be reordered or added to", () => {
  assert.deepEqual(ok(PAGE.replace("<p>One</p><p>Two</p>", "<p>Two</p><p>One</p><p>New</p>")), { ok: true });
});

test("a child moved out into another file is refused", () => {
  const Q = "partials/x.liquid";
  const r = checkLockChanges({ [P]: PAGE, [Q]: "<i>q</i>" }, { [P]: PAGE.replace("<p>One</p>", ""), [Q]: "<i>q</i><p>One</p>" });
  assert.equal(r.ok, false);
});

test("a file that doesn't parse after the write is skipped, not thrown", () => {
  assert.deepEqual(ok("<div"), { ok: true } as never);
});
