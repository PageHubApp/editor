import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, readTagArguments, setTagArgument, liquidString, EditError, NodeTypes, type TagWithArguments } from "../src/index.ts";
import { assertMinimalEdit, changedLines } from "./helpers.ts";

// Section settings live in the page file as tag arguments.
const PAGE = `<main>
  {% section 'hero', headline: "Smog checks in 15 minutes", photo: "k3j9", button: "Book now", count: 3 %}
  {% section 'faq' %}
</main>
`;

const sections = (src: string) =>
  parseSource(src)
    .children.flatMap((n) => ("children" in n && Array.isArray(n.children) ? n.children : []))
    .filter((n) => n.type === NodeTypes.LiquidTag && n.name === "section") as unknown as TagWithArguments[];

test("section arguments: read in source order with their types and exact value ranges", () => {
  const [hero, faq] = sections(PAGE);
  const args = readTagArguments(PAGE, hero!);
  assert.deepEqual(args.map((a) => [a.name, a.type, a.source]), [
    ["headline", "String", `"Smog checks in 15 minutes"`],
    ["photo", "String", `"k3j9"`],
    ["button", "String", `"Book now"`],
    ["count", "Number", "3"],
  ]);
  for (const a of args) assert.equal(PAGE.slice(a.range.start, a.range.end), a.source);
  assert.deepEqual(readTagArguments(PAGE, faq!), []);
});

test("section arguments: a settings edit changes only the value's bytes", () => {
  const [hero] = sections(PAGE);
  const r = setTagArgument(PAGE, hero!, "headline", liquidString("Walk-in smog checks"));
  assertMinimalEdit(PAGE, r.source, r.touched);
  assert.equal(r.touched.length, 1);
  assert.equal(PAGE.slice(r.touched[0]!.start, r.touched[0]!.end), `"Smog checks in 15 minutes"`);
  assert.ok(r.source.includes(`headline: "Walk-in smog checks", photo: "k3j9"`));
  assert.deepEqual(changedLines(PAGE, r.source), { removed: 1, added: 1 });
  assert.equal(readTagArguments(r.source, sections(r.source)[0]!)[0]!.source, `"Walk-in smog checks"`);
});

test("section arguments: missing argument throws", () => {
  const [hero] = sections(PAGE);
  assert.throws(() => setTagArgument(PAGE, hero!, "subtitle", `"x"`), EditError);
});

test("liquidString: Liquid strings have no escapes — pick the quote the value doesn't contain", () => {
  assert.equal(liquidString(`Book now`), `"Book now"`);
  assert.equal(liquidString(`The "best" smog`), `'The "best" smog'`);
  assert.throws(() => liquidString(`It's "best"`), EditError);
  const src = `<main>{% section 'hero', headline: ${liquidString(`The "best" smog`)} %}</main>`;
  assert.equal(readTagArguments(src, sections(src)[0]!)[0]!.source, `'The "best" smog'`);
});
