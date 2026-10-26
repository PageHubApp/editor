// The shapes pagehub.dev's AI references teach (utils/htmlFirst/liquidReference.ts, "Lists from the URL" and
// "Conditions the builder can edit") must be ones the builder reads back, or an AI-written list or condition becomes
// raw text. The strings below are the reference's own (its render test takes them from the reference text).
import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liquidKit } from "@pagehub/engine/kits";
import { serializeServer, parseServer } from "../src/features/inspector/conditions/conditionModel.ts";
import { buildPipeline, readDataSource } from "../src/features/inspector/dataSourceModel.ts";
import { wrapperOf } from "../src/features/liquid/markup.ts";
import { pageEditor } from "./inspectorFixture.tsx";

describe("the managed list shape the AI reference teaches", () => {
  const FILTER = "{% if request.query.color and request.query.color != '' %}{% assign v = v | where: 'colors', request.query.color %}{% endif %}";
  const read = (src: string) => {
    const e = pageEditor({ "index.liquid": `<section>${src}</section>` }, [liquidKit()]);
    return readDataSource(wrapperOf(e.get(".card"), ["for"])!);
  };

  it("an assign, one URL filter line, a paginate holding the loop: the panel reads all of it", () => {
    const ds = read(`{% assign v = collections.products | where: 'brand', 'Acme' | sort: 'price' %}${FILTER}{% paginate v by 12 %}{% for item in v limit: 12 %}<article class="card">{{ item.title }}</article>{% endfor %}<nav>x</nav>{% endpaginate %}`)!;
    assert.equal(ds.var, "v");
    assert.equal(ds.base, "collections.products");
    assert.deepEqual(ds.where, [{ prop: "brand", value: "Acme" }]);
    assert.equal(ds.sort, "price");
    assert.deepEqual(ds.urlFilters.map((f) => [f.param, f.field]), [["color", "colors"]]);
    assert.ok(ds.paginate, "the paginate block is its own");
    assert.equal(ds.limit, "12");
  });

  it("a bare assign (no where or sort) is managed too", () => {
    const ds = read(`{% assign v = collections.products %}${FILTER}{% for item in v %}<article class="card">{{ item.title }}</article>{% endfor %}`)!;
    assert.equal(ds.var, "v");
    assert.deepEqual(ds.urlFilters.map((f) => f.param), ["color"]);
    assert.equal(ds.paginate, null);
  });

  it("another filter in the assign is dropped when the panel rewrites it; a URL filter of another shape is not read", () => {
    const extra = read(`{% assign v = collections.products | where: 'brand', 'Acme' | reverse %}${FILTER}{% for item in v %}<article class="card">x</article>{% endfor %}`)!;
    assert.equal(buildPipeline(extra), `collections.products | where: "brand", "Acme"`, "only where, split and sort survive a panel edit");
    const odd = read(`{% assign v = collections.products %}{% if request.query.color %}{% assign v = v | where: 'colors', request.query.color %}{% endif %}{% for item in v %}<article class="card">x</article>{% endfor %}`)!;
    assert.equal(odd.urlFilters.length, 0, "only the exact one-line shape is a URL filter");
  });
});

describe("the server conditions the AI reference teaches", () => {
  it("the reference's example round-trips through the builder", () => {
    const text = "request.query.ref == 'ad' and company.phone != blank";
    const g = parseServer(text)!;
    assert.deepEqual(g.conds.map((c) => [c.type, c.key, c.op, c.value]), [["url-param", "ref", "equals", "ad"], ["company", "phone", "exists", ""]]);
    assert.equal(serializeServer(g), text);
  });

  it("every term form the reference lists parses; mixed and / or and the rest stay raw", () => {
    for (const t of ["item.title", "item.title == blank", "item.title != blank", "item.title == 'x'", "item.n != 3", "item.n > 3", "item.n < 3", "item.tags contains 'x'", "item.tags contains 'x' == false", "item.flag == true", "customer", "customer == blank", "me.plans.pro"]) {
      const g = parseServer(t);
      assert.ok(g, `${t} parses`);
    }
    for (const t of ["a == 1 and b == 2 or c == 3", "(a == 1)", "a >= 2", "not a", "a == b", "item.tags | size > 1"]) assert.equal(parseServer(t), null, `${t} stays raw`);
    assert.equal(serializeServer(parseServer("a == 1 and b == 2")!), "a == 1 and b == 2");
    assert.equal(serializeServer(parseServer("a == 1 or b == 2")!), "a == 1 or b == 2");
  });
});
