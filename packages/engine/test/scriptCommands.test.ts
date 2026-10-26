import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEditor } from "../src/testing/index.ts";
import { componentNames } from "../src/kits/liquid/componentCommands.ts";
import { SCRIPTS_PARTIAL, everywhereNames, javascriptBlocks, pagesWithoutScripts, scriptNames, scriptNameProblem, scriptUses } from "../src/kits/liquid/scriptCommands.ts";

const files = () => ({
  "pages/index.liquid": `<main><script src="{{ 'app.js' | asset_url }}" defer></script></main>\n`,
  "pages/about.liquid": `<main>About</main>\n`,
  "assets/app.js": "console.log(1);\n",
});
const ed = (f: Record<string, string> = files()) => createTestEditor({ files: f });

describe("script commands", () => {
  it("creates a file with a starter line and lists it", () => {
    const e = ed();
    assert.ok(e.run("script.create", { name: "menu.js" }));
    assert.equal(e.state.files.get("assets/menu.js"), "// menu.js\n");
    assert.deepEqual(scriptNames(e.state.files), ["app.js", "menu.js"]);
  });
  it("refuses a bad or taken name", () => {
    const e = ed();
    assert.equal(e.run("script.create", { name: "App.js" }), false);
    assert.equal(e.run("script.create", { name: "app.js" }), false);
    assert.match(scriptNameProblem(e.state.files, "x.css")!, /\.js/);
  });
  it("renames the file and every asset_url of it, as one undo step", () => {
    const e = ed();
    assert.ok(e.run("script.rename", { from: "app.js", to: "site.js" }));
    assert.equal(e.state.files.get("assets/app.js"), "");
    assert.equal(e.state.files.get("assets/site.js"), "console.log(1);\n");
    assert.match(e.state.files.get("pages/index.liquid")!, /'site\.js' \| asset_url/);
    assert.deepEqual(scriptUses(e.state.files, "app.js"), []);
    e.run("history.undo");
    assert.equal(e.state.files.get("assets/app.js"), "console.log(1);\n");
    assert.match(e.state.files.get("pages/index.liquid")!, /'app\.js' \| asset_url/);
  });
  it("loads a script on every page through one partial the pages render", () => {
    const e = ed();
    assert.ok(e.run("script.setEverywhere", { name: "app.js", on: true }));
    assert.deepEqual(everywhereNames(e.state.files), ["app.js"]);
    assert.deepEqual(pagesWithoutScripts(e.state.files), []);
    assert.match(e.state.files.get("pages/about.liquid")!, /\{% render 'site-scripts' %\}/);
    assert.deepEqual(componentNames(e.state.files), []);
    assert.ok(e.run("script.setEverywhere", { name: "app.js", on: false }));
    assert.deepEqual(everywhereNames(e.state.files), []);
    assert.ok(e.state.files.get(SCRIPTS_PARTIAL)!.trim());
  });
  it("deleting empties the file and drops it from the every-page partial", () => {
    const e = ed();
    e.run("script.setEverywhere", { name: "app.js", on: true });
    assert.ok(e.run("script.remove", { name: "app.js" }));
    assert.equal(e.state.files.get("assets/app.js"), "");
    assert.deepEqual(scriptNames(e.state.files), []);
    assert.deepEqual(everywhereNames(e.state.files), []);
  });
  it("finds {% javascript %} blocks with their line", () => {
    const text = `<p>x</p>\n{% javascript %}\n  // open menu\n  go();\n{% endjavascript %}\n`;
    assert.deepEqual(javascriptBlocks(text), [{ line: 2, preview: "// open menu" }]);
  });
});
