import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { defineDataSource } from "@pagehub/engine/render";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { dataSourceGlobals, expressionCompletions } from "../src/features/liquid/completions.ts";
import { rendered } from "./canvasHarness.tsx";
import { render } from "./harness.tsx";

const source = (global: string) => defineDataSource({ name: global, liquid: { global }, query: async () => [] });
const PAGE = `<ul>{% for p in products %}<li>{{ p.title }}</li>{% endfor %}</ul>\n`;

const mounted: Array<() => void> = [];
afterEach(() => {
  for (const u of mounted.splice(0)) u();
});

describe("expression completions come from the registered data sources", () => {
  it("offers each registered global, the built-in objects, the loop variable and the sample data keys", () => {
    const e = createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), tailwindKit(), liquidKit(), editorKit(), source("products"), source("collections"), source("customer")] });
    const li = e.get("li");
    const names = expressionCompletions(li, { company: {} }, dataSourceGlobals(e.state.config));
    for (const name of ["products", "collections", "customer", "site", "request", "company", "p", "forloop"]) assert.ok(names.includes(name), `${name} is offered`);
  });

  it("with no data source registered there is no products / cart / customer suggestion", () => {
    const e = createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), tailwindKit(), liquidKit(), editorKit()] });
    const names = expressionCompletions(e.get("li"), {}, dataSourceGlobals(e.state.config));
    for (const name of ["products", "cart", "customer"]) assert.ok(!names.includes(name), `${name} is not hard-coded`);
    assert.ok(names.includes("site"));
  });

  it("a configuration with data sources still renders the canvas (the renderer takes them as runtime extensions)", async () => {
    const e = createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), tailwindKit(), liquidKit(), editorKit(), canvasKit(), source("products")], data: { products: [{ title: "Fern" }] } });
    const r = render(<Editor editor={e} />);
    mounted.push(r.unmount);
    const doc = await rendered(r);
    assert.equal(doc.querySelector("li")?.textContent, "Fern");
  });
});
