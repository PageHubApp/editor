import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEditor } from "../src/testing/index.ts";

const P = "p.liquid";
const LOOP = `<ul>
  {% for p in products %}
    <li>{{ p.title }}</li>
  {% endfor %}
</ul>
`;
const COND = `<main>
  {% if customer %}
    <p>Hi</p>
  {% else %}
    <p>Sign in</p>
  {% endif %}
</main>
`;

const ed = (src: string) => createTestEditor({ files: { [P]: src } });
const on = (src: string, sel: string) => {
  const e = ed(src);
  e.select(e.get(sel));
  return e;
};

describe("liquid block commands: exact diffs, one undo step each", () => {
  it("setArg appends, edits and removes a `for` argument", () => {
    const e = on(LOOP, "%for");
    assert.ok(e.run("liquid.setArg", { name: "limit", value: "3" }));
    assert.equal(e.text(), LOOP.replace("in products %}", "in products, limit: 3 %}"));
    assert.ok(e.run("liquid.setArg", { name: "limit", value: "4" }));
    assert.equal(e.text(), LOOP.replace("in products %}", "in products, limit: 4 %}"));
    assert.ok(e.run("liquid.setArg", { name: "limit", value: "" }));
    assert.equal(e.text(), LOOP);
    assert.equal(e.run("liquid.setArg", { name: "limit", value: "" }), false, "nothing to remove");
  });

  it("setArg removes a first argument together with the comma after it", () => {
    const src = `{% render 'card', title: "Hi", size: 2 %}\n`;
    const e = on(src, "%render");
    assert.ok(e.run("liquid.setArg", { name: "title", value: "" }));
    assert.equal(e.text(), `{% render 'card', size: 2 %}\n`);
    const m = on(`{% map zoom: 4, lat: 1 %}{% endmap %}\n`, "%map");
    assert.ok(m.run("liquid.setArg", { name: "zoom", value: "" }));
    assert.equal(m.text(), `{% map lat: 1 %}{% endmap %}\n`);
  });

  it("setMarkup rewrites only the bytes that differ", () => {
    const e = on(LOOP, "%for");
    assert.ok(e.run("liquid.setMarkup", { markup: "p in collections.shoes reversed" }));
    assert.equal(
      e.diff(),
      `--- a/p.liquid
+++ b/p.liquid
@@ -1,5 +1,5 @@
 <ul>
-  {% for p in products %}
+  {% for p in collections.shoes reversed %}
     <li>{{ p.title }}</li>
   {% endfor %}
 </ul>
`,
    );
    assert.equal(e.run("liquid.setMarkup", { markup: "x %}{% raw" }), false, "can't break out of the tag");
    assert.equal(e.run("liquid.setMarkup", { markup: "p in" }), false, "must still parse");
    assert.ok(e.undo());
    assert.equal(e.text(), LOOP);
  });

  it("setMarkup on a branch edits that branch tag", () => {
    const src = `{% case c %}{% when 'red' %}R{% when 'blue' %}B{% endcase %}\n`;
    const e = on(src, "%case");
    assert.ok(e.run("liquid.setMarkup", { branch: 2, markup: "'blue', 'navy'" }));
    assert.equal(e.text(), `{% case c %}{% when 'red' %}R{% when 'blue', 'navy' %}B{% endcase %}\n`);
  });

  it("addBranch places else before the close tag and elsif before else", () => {
    const e = on(LOOP, "%for");
    assert.ok(e.run("liquid.addBranch", { branch: "else" }));
    assert.equal(e.text(), LOOP.replace("  {% endfor %}", "  {% else %}\n  {% endfor %}"));
    assert.equal(e.run("liquid.addBranch", { branch: "else" }), false, "one else");
    assert.equal(e.run("liquid.addBranch", { branch: "elsif", markup: "x" }), false, "for has no elsif");

    const c = on(COND, "%if");
    assert.equal(c.run("liquid.addBranch", { branch: "elsif", markup: "guest ==" }), false, "the condition must parse");
    assert.ok(c.run("liquid.addBranch", { branch: "elsif", markup: "guest" }));
    assert.equal(c.text(), COND.replace("  {% else %}", "  {% elsif guest %}\n  {% else %}"));
  });

  it("removeBranch drops a branch tag and its body", () => {
    const e = on(COND, "%if");
    assert.ok(e.run("liquid.removeBranch", { index: 1 }));
    assert.equal(e.text(), `<main>\n  {% if customer %}\n    <p>Hi</p>\n  {% endif %}\n</main>\n`);
    assert.equal(e.run("liquid.removeBranch", { index: 0 }), false, "the main branch stays");
  });

  it("unwrap is the inverse of wrapIf", () => {
    const src = `<main>\n  <p>Hi</p>\n</main>\n`;
    const e = on(src, "p");
    assert.ok(e.run("liquid.wrapIf", { condition: "customer" }));
    const wrapped = e.text();
    assert.equal(wrapped, `<main>\n  {% if customer %}\n    <p>Hi</p>\n  {% endif %}\n</main>\n`);
    e.select(e.get("%if"));
    assert.ok(e.run("liquid.unwrap", {}));
    assert.equal(e.text(), src);
    assert.equal(on(COND, "%if").run("liquid.unwrap", {}), false, "a block with an else keeps its tags");
  });

  it("source.replace writes line splices for a node or a whole file", () => {
    const e = on(LOOP, "%for");
    const h = e.get("%for");
    assert.ok(e.run("source.replace", { at: h, text: h.text().replace("<li>", '<li class="x">') }));
    assert.equal(e.text(), LOOP.replace("<li>", '<li class="x">'));
    assert.ok(e.run("source.replace", { path: P, text: "<p>new</p>\n" }));
    assert.equal(e.text(), "<p>new</p>\n");
    assert.equal(e.run("source.replace", { path: P, text: "<p>unclosed\n" }), false, "must parse");
    assert.equal(e.run("source.replace", { path: "nope.liquid", text: "" }), false);
  });
});
