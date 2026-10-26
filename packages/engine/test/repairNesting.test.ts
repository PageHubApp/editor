import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, repairNesting, describeNestingFixes } from "../src/index.ts";

const strictOk = (s: string) => {
  parseSource(s, "strict");
};

const cases: Array<[string, string, string]> = [
  ["stray </p> inside an li", `<ul><li data-t="a"><p>x</p></p></li></ul>`, `<ul><li data-t="a"><p>x</p></li></ul>`],
  ["li closed by the next li", `<ul><li>a<li>b</ul>`, `<ul><li>a</li><li>b</li></ul>`],
  ["p closed by the next p", `<div><p>one<p>two</div>`, `<div><p>one</p><p>two</p></div>`],
  ["inline element left open at a close", `<div><b>x</div>`, `<div><b>x</b></div>`],
  ["unclosed at the end of the file", `<main><section><div>x`, `<main><section><div>x</div></section></main>`],
  ["stray close tag with no opener", `<div>a</span></div>`, `<div>a</div>`],
  ["table cells", `<table><tr><td>a<td>b<tr><td>c</table>`, `<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>`],
  ["a Liquid block ends the HTML opened in it", `<ul>{% for i in l %}<li>{{ i }}{% endfor %}</ul>`, `<ul>{% for i in l %}<li>{{ i }}</li>{% endfor %}</ul>`],
  ["attributes with > and Liquid are skipped", `<ul><li title="a>b" class="{{ c }}">x<li>y</ul>`, `<ul><li title="a>b" class="{{ c }}">x</li><li>y</li></ul>`],
  ["script bodies are not scanned", `<div><script>var a = "<p>";</script>x</p></div>`, `<div><script>var a = "<p>";</script>x</div>`],
];

for (const [label, src, want] of cases) {
  test(`repairNesting: ${label}`, () => {
    assert.throws(() => strictOk(src), "the input must be invalid to start with");
    const r = repairNesting(src);
    assert.equal(r.source, want);
    assert.ok(r.fixes.length > 0 && r.fixes.every((f) => f.line >= 1 && f.message));
    strictOk(r.source);
    assert.equal(repairNesting(r.source).fixes.length, 0, "idempotent");
  });
}

test("repairNesting: valid source is untouched, including <p> holding block content", () => {
  for (const src of [`<p>text<ul><li>a</li></ul></p>`, `<div><p>a<div>b</div></p></div>`, `<ul><li><p>x</p></li></ul>`]) {
    const r = repairNesting(src);
    assert.equal(r.source, src);
    assert.deepEqual(r.fixes, []);
  }
});

test("repairNesting: nothing is dropped but a close tag that closes nothing", () => {
  const src = `<div id="a" data-edit-id="e1"><p>keep</p></p><b>this</div>`;
  const r = repairNesting(src);
  const text = (s: string) => s.replace(/<[^>]*>/g, "");
  assert.equal(text(r.source), text(src));
  assert.ok(r.source.includes(`data-edit-id="e1"`));
});

test("repairNesting: an unrepairable file comes back unchanged", () => {
  const src = `<div {% if x %}class="a"{% endif %`;
  const r = repairNesting(src);
  assert.equal(r.source, src);
  assert.deepEqual(r.fixes, []);
});

test("describeNestingFixes names the file and the first fix", () => {
  const r = repairNesting(`<ul><li>a</p></li></ul>`);
  assert.match(describeNestingFixes("pages/index.liquid", r.fixes), /^Fixed invalid HTML nesting in pages\/index\.liquid/);
});

test("renderPage: a page with invalid nesting renders as a browser reads it instead of throwing", async () => {
  const { createRenderer, renderPage } = await import("../src/render.ts");
  const src = `<main><ul><li data-edit-id="abc123"><p>x</p></p></li><li>a<li>b</ul><div data-editable="t">z</div></main>`;
  const r = createRenderer({ files: (p: string) => (p === "pages/index.liquid" ? src : undefined) });
  const out = await renderPage(r, { path: "pages/index.liquid", url: "/", source: src, meta: {} }, { path: "/", method: "GET", query: {}, params: {} }, { dataSources: [], site: { pages: [] } as never, mode: "publish", stripEditable: true });
  assert.equal(out.html, `<main><ul><li><p>x</p></li><li>a</li><li>b</li></ul><div>z</div></main>`);
});
