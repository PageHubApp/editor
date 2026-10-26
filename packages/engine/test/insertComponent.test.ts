import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit, liquidKit } from "../src/kits.ts";

describe("inserting a component instance", () => {
  it("a {% render %} snippet inserts after the selection, or at the top level of a file", () => {
    const e = createTestEditor({ files: { "index.liquid": `<main><h1>A</h1></main>\n` }, extensions: [htmlKit(), liquidKit()] });
    e.select(e.get("h1"));
    assert.ok(e.run("element.insert", { snippet: `{% render 'card' %}` }));
    assert.equal(e.text(), `<main><h1>A</h1>{% render 'card' %}</main>\n`);
    const f = createTestEditor({ files: { "index.liquid": `<h1>A</h1>\n` }, extensions: [htmlKit()] });
    assert.ok(f.run("element.insert", { snippet: `{% render 'card' %}`, path: "index.liquid" }));
    assert.equal(f.text(), `<h1>A</h1>\n{% render 'card' %}\n`);
  });

  it("with nothing selected a snippet lands inside the page's <main>, before its footer render", () => {
    const files = { "index.liquid": `<main>\n{% render 'header' %}\n<article><h1>A</h1></article>\n{% render 'footer' %}\n</main>\n` };
    const e = createTestEditor({ files, extensions: [htmlKit(), liquidKit()] });
    assert.ok(e.run("element.insert", { snippet: `<p>new</p>`, path: "index.liquid" }));
    const text = e.text();
    assert.ok(text.indexOf("<p>new</p>") > text.indexOf("</article>"), text);
    assert.ok(text.indexOf("<p>new</p>") < text.indexOf("{% render 'footer' %}"), text);
    assert.ok(text.indexOf("<p>new</p>") < text.indexOf("</main>"), text);
  });

  it("with no footer the snippet is appended inside <main>, never after it", () => {
    const e = createTestEditor({ files: { "index.liquid": `<main><h1>A</h1></main>\n` }, extensions: [htmlKit()] });
    assert.ok(e.run("element.insert", { snippet: `<p>new</p>`, path: "index.liquid" }));
    assert.equal(e.text(), `<main><h1>A</h1><p>new</p></main>\n`);
  });

  it("loose text still can't land at the top level of a file", () => {
    const f = createTestEditor({ files: { "index.liquid": `<h1>A</h1>\n` }, extensions: [htmlKit()] });
    assert.equal(f.run("element.insert", { snippet: `just words`, path: "index.liquid" }), false);
  });
});
