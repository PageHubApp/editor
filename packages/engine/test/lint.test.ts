import { test } from "node:test";
import assert from "node:assert/strict";
import { lint, type LintRuleId } from "../src/index.ts";
import { SAMPLE } from "./helpers.ts";

const cases: Array<[string, string, LintRuleId[]]> = [
  ["tag in attribute list", `<div {% if x %}class="a"{% endif %} id="b">hi</div>`, ["no-liquid-in-attr-list"]],
  ["output in attribute list", `<input {{ attrs }} name="q">`, ["no-liquid-in-attr-list"]],
  // The gated action the editor's "only fire when" writes (editor actionGate.ts): one {% if %} of action attributes.
  ["a gated action", `<button class="btn" {% if customer %}data-cart="add"{% endif %}>Buy</button>`, []],
  ["a gated action with several attributes and an output value", `<a class="btn" {% if customer == blank %}data-cart="add" data-cart-id="{{ p.id }}" href="/shop"{% endif %}>Buy</a>`, []],
  ["a gated action with else", `<button {% if customer %}data-cart="add"{% else %}data-cart="open"{% endif %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["a gated action with elsif", `<button {% if a %}data-cart="add"{% elsif b %}data-cart="open"{% endif %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["unless in an attribute list", `<button {% unless customer %}data-cart="add"{% endunless %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["an on* handler in a gate", `<button {% if customer %}onclick="go()"{% endif %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["a javascript: URL in a gate", `<a {% if customer %}href="javascript:alert(1)"{% endif %}>x</a>`, ["no-liquid-in-attr-list"]],
  ["an editor attribute in a gate", `<button {% if customer %}data-edit-id="abcdef"{% endif %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["a tag nested in a gate", `<button {% if a %}{% if b %}data-cart="add"{% endif %}{% endif %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["an empty gate", `<button {% if a %}{% endif %}>x</button>`, ["no-liquid-in-attr-list"]],
  ["element split across branches", `{% if x %}<a href="/">{% else %}<span>{% endif %}text{% if x %}</a>{% else %}</span>{% endif %}`, ["no-dangling-close", "no-dangling-open"]],
  ["{% if %} inside an attribute value is allowed (Shopify Liquid)", `<div class="card {% if x %}active{% else %}idle{% endif %}" aria-current="{% if here %}page{% endif %}">hi</div>`, []],
  ["{{ output }} inside an attribute value is allowed", `<div class="card {{ variant }}" data-id="{{ item.id | escape }}">hi</div>`, []],
  ["Liquid in an attribute name", `<div data-{{ k }}="v">hi</div>`, ["static-attr-name"]],
  ["Liquid as a tag name", `<{{ tag }} class="a">x</{{ tag }}>`, ["static-tag-name"]],
  ["unclosed HTML", `<div>\n<p>x</div>`, ["parse"]],
  ["the sample page", SAMPLE, []],
];

for (const [label, src, expected] of cases) {
  test(`lint: ${label}`, () => {
    const issues = lint(src);
    assert.deepEqual([...new Set(issues.map((i) => i.rule))].sort(), [...expected].sort());
    for (const i of issues) assert.ok(i.range.start >= 0 && i.range.end <= src.length && i.range.start <= i.range.end);
  });
}

test("lint: a parse error points at the offending tag", () => {
  const src = `<div>\n<p>x</div>`;
  const [issue] = lint(src);
  assert.equal(src.slice(issue!.range.start, issue!.range.end), "</div>");
});

test("lint: issue ranges point at the offending source", () => {
  const src = `<input class="q" {{ attrs }} name="q">`;
  const [issue] = lint(src);
  assert.equal(src.slice(issue!.range.start, issue!.range.end), "{{ attrs }}");
});
