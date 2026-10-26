import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../src/editor/createEditor.ts";
import { filterVariables, variableCatalogue, variableGroupsFacet } from "../src/editor/variables.ts";

const PAGE = `{% assign greeting = "Hi" %}{% capture tagline %}x{% endcapture %}<h1>{{ greeting }}</h1>
{% schema %}{"name":"Hero","settings":[{"type":"text","id":"heading","label":"Heading"}]}{% endschema %}
`;
const DATA = { company: { name: "Acme", contact: { email: "a@b.c" } }, shop: { currency: "USD", open: true }, products: [{ title: "x" }] };

test("variables: Company / System / Section / Custom / Other from data and source; arrays are loops, not outputs", async () => {
  const editor = await createEditor({ storage: { "index.liquid": PAGE }, data: DATA });
  const groups = variableCatalogue(editor);
  assert.deepEqual(groups.map((g) => g.name), ["Company", "System", "Section", "Custom", "Other"]);
  const by = Object.fromEntries(groups.map((g) => [g.name, g.items.map((i) => i.expression)]));
  assert.deepEqual(by.Company, ["company.name", "company.contact.email"]);
  assert.ok(by.System!.includes("'now' | date: '%Y'"));
  assert.deepEqual(by.Section, ["section.settings.heading"]);
  assert.deepEqual(by.Custom, ["greeting", "tagline"]);
  assert.deepEqual(by.Other, ["shop.currency", "shop.open"]);
  assert.equal(groups[0]!.items[0]!.sample, "Acme");
  assert.equal(groups[0]!.items[0]!.label, "Name");
  editor.destroy();
});

test("variables: a host adds groups through variableGroupsFacet; filter matches label or expression and drops empty groups", async () => {
  const extra = variableGroupsFacet.of(() => [{ name: "Agency", items: [{ expression: "agency.phone", label: "Phone" }, { expression: "bad }} expr", label: "Bad" }] }]);
  const editor = await createEditor({ storage: { "index.liquid": "<p>x</p>" }, data: DATA, extensions: [extra] });
  const groups = variableCatalogue(editor);
  assert.deepEqual(groups.at(-1), { name: "Agency", items: [{ expression: "agency.phone", label: "Phone" }], });
  assert.deepEqual(filterVariables(groups, "PHONE").map((g) => g.name), ["Agency"]);
  assert.deepEqual(filterVariables(groups, "contact.em").map((g) => g.items.map((i) => i.expression)), [["company.contact.email"]]);
  assert.equal(filterVariables(groups, "").length, groups.length);
  editor.destroy();
});
