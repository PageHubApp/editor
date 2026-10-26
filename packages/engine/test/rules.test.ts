import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "../src/testing/ruleTester.ts";
import { coreRules } from "../src/rules/coreRules.ts";
import * as structural from "../src/rules/core/structural.ts";
import * as registryRules from "../src/rules/core/registryRules.ts";
import * as security from "../src/rules/core/security.ts";
import * as sections from "../src/rules/core/sections.ts";
import * as a11y from "../src/rules/core/a11y.ts";
import { defineRule } from "../src/rules/defineRule.ts";
import { createRuleRunner, runRules } from "../src/rules/run.ts";
import { applyFixes, sanitizeSource } from "../src/rules/fixer.ts";
import { registryOfEngine } from "../src/rules/registry.ts";
import { createEngine } from "../src/liquid/engine.ts";
import { builtinTags } from "../src/runtime/tags/builtinTags.ts";
import { builtinFilters } from "../src/runtime/filters/builtinFilters.ts";
import { SAMPLE } from "./helpers.ts";

test("structural rules", () => {
  RuleTester.run(structural.parseRule, { valid: ["<div>x</div>"], invalid: [{ code: "<div>\n<p>x</div>", errors: [{ text: "</div>" }], output: null }] });
  RuleTester.run(structural.noLiquidInAttrList, { valid: [`<div class="a">x</div>`], invalid: [{ code: `<input {{ attrs }} name="q">`, errors: [{ text: "{{ attrs }}" }] }] });
  RuleTester.run(structural.noTagInAttrValue, { valid: [`<div class="{{ v }}">x</div>`], invalid: [{ code: `<div class="a {% if x %}b{% endif %}">x</div>`, errors: [{ text: "{% if x %}b{% endif %}" }] }] });
  RuleTester.run(structural.noDanglingOpen, { valid: ["<p>x</p>"], invalid: [{ code: `{% if x %}<a href="/">{% else %}<span>{% endif %}t{% if x %}</a>{% else %}</span>{% endif %}`, errors: 2 }] });
  RuleTester.run(structural.noDanglingClose, { valid: ["<p>x</p>"], invalid: [{ code: `{% if x %}<a>{% else %}<b>{% endif %}x{% if x %}</a>{% else %}</b>{% endif %}`, errors: 2 }] });
  RuleTester.run(structural.staticAttrName, { valid: ["<p data-a=1>x</p>"], invalid: [{ code: `<div data-{{ k }}="v">x</div>`, errors: 1 }] });
  RuleTester.run(structural.staticTagName, { valid: ["<p>x</p>"], invalid: [{ code: `<{{ t }}>x</{{ t }}>`, errors: 1 }] });
});

test("unknown-tag / unknown-filter", () => {
  const registry = { tags: new Set(["if", "assign", "schema"]), filters: new Set(["upcase"]), removedTags: new Set(["layout"]) };
  RuleTester.run(registryRules.unknownTag, {
    valid: [{ code: "{% if x %}a{% endif %}", registry }, "{% nothing %}"],
    invalid: [
      { code: "{% foo %}", registry, errors: [{ message: "unknown tag {% foo %}" }] },
      { code: "{% layout 'x' %}", registry, errors: [{ message: /removed/ }] },
    ],
  });
  RuleTester.run(registryRules.unknownFilter, {
    valid: [{ code: "{{ a | upcase }}", registry }],
    invalid: [{ code: "{{ a | upcase | shout }}", registry, errors: [{ message: 'unknown filter "shout"', text: " | shout" }] }],
  });
});

test("real engine registry knows the sample page", () => {
  const host = { imageUrl: () => "", fileUrl: () => "", icon: () => "" } as never;
  const registry = registryOfEngine(createEngine({ tags: builtinTags({ files: () => undefined, formHandler: () => ({ ok: true }) }), filters: builtinFilters(host) }));
  assert.ok(runRules(coreRules, { "p.html": "{% layout 'x' %}" }, { registry }).some((d) => /removed/.test(d.message)));
  const bad = runRules(coreRules, { "page.html": SAMPLE }, { registry }).filter((d) => d.severity === "error");
  assert.deepEqual(bad.map((d) => `${d.rule}: ${d.message}`), []);
});

test("no-inline-js (sanitize fixes)", () => {
  RuleTester.run(security.noInlineJs, {
    valid: [`<script type="application/ld+json">{}</script><a href="/x" class="a">x</a><a href="{{ u }}">y</a>`],
    invalid: [
      { code: `<button onclick="a()" id="b">x</button>`, errors: [{ text: `onclick="a()"` }], output: `<button id="b">x</button>` },
      { code: `<p>a</p><script>alert(1)</script>`, errors: 1, output: `<p>a</p>` },
      { code: `<a href="  JavaScript:x">x</a>`, errors: 1, output: `<a>x</a>` },
      { code: `<form action="vbscript:x"></form>`, errors: 1, output: `<form></form>` },
      { code: `<iframe src="data:text/html,hi"></iframe>`, errors: 1, output: `<iframe></iframe>` },
      { code: `<script type="text/javascript">1</script>`, errors: 1 },
    ],
  });
  const meta = security.noInlineJs.meta;
  assert.equal(meta.fixKind, "sanitize");
  const r = sanitizeSource(`<a href="javascript:x" onclick="y()" class="k">x</a><script>1</script>`, [security.noInlineJs]);
  assert.equal(r.output, `<a class="k">x</a>`);
  assert.equal(r.changed, true);
});

test("no-liquid-tag-in-script", () => {
  RuleTester.run(security.noLiquidTagInScript, {
    valid: [`<script type="application/json">{"a":"{{ x }}"}</script>`, `{% style %}a{ color: {{ c }} }{% endstyle %}`],
    invalid: [{ code: `<script>{% if x %}a(){% endif %}</script>`, errors: [{ text: "{% if x %}" }, { text: "{% endif %}" }] }, { code: `<style>{% if x %}a{}{% endif %}</style>`, errors: 2 }],
  });
});

test("raw-only-trusted", () => {
  const richtext = `{% schema %}{"name":"S","settings":[{"type":"richtext","id":"body","label":"B"},{"type":"text","id":"t","label":"T"}]}{% endschema %}`;
  RuleTester.run(security.rawOnlyTrusted, {
    valid: [
      `{{ a | link_to: "/x" | raw }}`,
      { code: `{{ x | image_tag | raw }}`, name: "builtin trusted" },
      { code: `{{ x | mine | raw }}`, trustedFilters: ["mine"], name: "registered raw: true" },
      `{{ x | escape }}`,
      `{{ section.settings.body | raw }}${richtext}`,
    ],
    invalid: [
      { code: `{{ x | raw }}`, errors: [{ text: " | raw" }], output: null, suggestions: [[`{{ x }}`]] },
      { code: `{{ x | upcase | raw }}`, errors: 1 },
      { code: `{{ section.settings.t | raw }}${richtext}`, errors: 1 },
      { code: `{{ section.settings.body | upcase | raw }}${richtext}`, errors: 1 },
    ],
  });
});

test("editor-attr-value", () => {
  RuleTester.run(security.editorAttrValue, {
    valid: [`<p data-edit-id="abc123" data-editable="text" data-edit-lock="drag delete">x</p>`],
    invalid: [
      { code: `<p data-edit-id="NOPE">x</p>`, errors: 1, output: null },
      { code: `<p data-editable="video">x</p>`, errors: 1 },
      { code: `<p class="k" data-edit-src="a#1">x</p>`, errors: 1, output: `<p class="k">x</p>` },
      { code: `<p data-edit-name="{{ n }}">x</p>`, errors: 1 },
    ],
  });
});

const hero = `{% schema %}{"name":"Hero","settings":[{"type":"text","id":"headline","label":"H"},{"type":"checkbox","id":"badge","label":"B"},{"type":"range","id":"n","label":"N","min":1,"max":9}]}{% endschema %}`;
const files = { "sections/hero.liquid": hero };

test("section rules", () => {
  RuleTester.run(sections.sectionLiteralArgs, {
    valid: [`{% section "hero", headline: "x", n: 3, badge: true %}`],
    invalid: [{ code: `{% section "hero", headline: page.title %}`, errors: [{ text: "page.title" }] }, { code: `{% section "hero", badge: nil %}`, errors: 1 }],
  });
  RuleTester.run(sections.sectionSettingType, {
    valid: [{ code: `{% section "hero", headline: "x", n: 3, badge: false %}`, files }, `{% section "hero", n: "x" %}`],
    invalid: [
      { code: `{% section "hero", headline: 3, n: "four", badge: "yes" %}`, files, errors: [{ text: "3" }, { text: `"four"` }, { text: `"yes"` }] },
      { code: `{% section "hero", headline: page.title %}`, files, errors: 0 },
    ].slice(0, 1),
  });
  RuleTester.run(sections.sectionUnknownSetting, {
    valid: [{ code: `{% section "hero", headline: "x" %}`, files }],
    invalid: [{ code: `{% section "hero", headline: "x", nope: 1 %}`, files, errors: [{ text: "1", severity: "warning" }], suggestions: [[`{% section "hero", headline: "x" %}`]] }],
  });
});

test("a11y rules", () => {
  RuleTester.run(a11y.imgAlt, {
    valid: [`<img src="a.png" alt="x">`, `<img src="a.png" alt="">`],
    invalid: [{ code: `<img src="a.png">`, errors: 1, output: null, suggestions: [[`<img alt="" src="a.png">`]] }],
  });
  RuleTester.run(a11y.inputLabel, {
    valid: [
      `<label for="e">Email</label><input id="e" type="email">`, `<label>Name <input name="n"></label>`, `<input type="hidden" name="a">`,
      `<input type="submit">`, `<input aria-label="Search">`, `<select aria-labelledby="x"></select>`, `<input id="a-{{ i }}">`,
    ],
    invalid: [{ code: `<input name="q">`, errors: 1 }, { code: `<label for="x">L</label><textarea id="y"></textarea>`, errors: 1 }],
  });
  RuleTester.run(a11y.headingOrder, {
    valid: [`<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>`, `<h2>a</h2>`, `<h1>a</h1>{% if x %}<h4>b</h4>{% endif %}`],
    invalid: [{ code: `<h1>a</h1><h3>b</h3>`, errors: 1 }],
  });
  RuleTester.run(a11y.singleH1, {
    valid: [`<h1>a</h1>`, `<h1>a</h1>{% if x %}<h1>b</h1>{% endif %}`, { code: `<h1>a</h1><h1>b</h1>`, path: "sections/hero.liquid" }],
    invalid: [{ code: `<h1>a</h1><h1>b</h1>`, errors: 1 }],
  });
});

test("defineRule: shared traversal, exit hooks, ancestors, config", () => {
  const order: string[] = [];
  const a = defineRule({ meta: { id: "a", severity: "error", description: "" }, create: (ctx) => ({
    Program: () => void order.push("a:program"),
    HtmlElement: (n) => void order.push(`a:${n.name[0].value}:${ctx.ancestors.length}`),
    "HtmlElement:exit": (n) => void order.push(`a:/${n.name[0].value}`),
    "Program:exit": () => void order.push("a:end"),
  }) });
  const b = defineRule({ meta: { id: "b", severity: "warning", description: "" }, create: () => ({ HtmlElement: (n) => void order.push(`b:${n.name[0].value}`) }) });
  runRules([a, b], { f: "<div><p>x</p></div>" });
  assert.deepEqual(order, ["a:program", "a:div:1", "b:div", "a:p:2", "b:p", "a:/p", "a:/div", "a:end"]);
  assert.throws(() => runRules([a, a], { f: "" }), /duplicate rule id/);
  assert.throws(() => defineRule({ meta: { id: "Bad_Id", severity: "error", description: "" }, create: () => ({}) }), /kebab-case/);
  const off = runRules([structural.staticTagName], { f: "<{{ t }}>x</{{ t }}>" }, { severity: { "static-tag-name": "off" } });
  assert.deepEqual(off, []);
  const warn = runRules([structural.staticTagName], { f: "<{{ t }}>x</{{ t }}>" }, { severity: { "static-tag-name": "warning" } });
  assert.equal(warn[0]!.severity, "warning");
});

test("applyFixes skips overlapping fixes; runner is incremental", () => {
  const src = `<a onclick="x()" href="javascript:y">t</a>`;
  const d = runRules([security.noInlineJs], { f: src });
  assert.equal(applyFixes(src, d, { kind: "fix" }).applied.length, 0);
  assert.equal(applyFixes(src, d, { kind: "sanitize" }).output, `<a>t</a>`);
  const runner = createRuleRunner(coreRules);
  const files = { "a.html": "<h1>a</h1>", "b.html": `<img src="x">`, "sections/hero.liquid": hero };
  runner.run(files);
  assert.equal(runner.lastChecked, 3);
  runner.run({ ...files, "b.html": `<img src="x" alt="">` });
  assert.equal(runner.lastChecked, 1);
  const out = runner.run(files);
  assert.equal(runner.lastChecked, 1);
  assert.ok(out.some((x) => x.rule === "img-alt"));
  runner.run({ ...files, "sections/hero.liquid": hero.replace("Hero", "Hero2") });
  assert.equal(runner.lastChecked, 3, "bundle rules re-check when a section changes");
});

test("the shipped rules keep a site's own JavaScript; no-inline-js strips it only where a catalog adds it", () => {
  const src = `<button onclick="a()" class="b">x</button><a href="javascript:x()" onmouseover="m()">y</a><script>1</script>`;
  assert.equal(sanitizeSource(src, coreRules, { path: "p.liquid" }).output, src);
  assert.ok(!coreRules.some((r) => r.meta.id === "no-inline-js"));
  assert.equal(sanitizeSource(src, [...coreRules, security.noInlineJs], { path: "p.liquid" }).output, `<button class="b">x</button><a>y</a>`);
});
