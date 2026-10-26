import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValueName, partialVariables, valueRows } from "../src/features/liquid/partialVars.ts";

describe("partialVariables: the values a partial has to be given", () => {
  it("lists variables in order of first use, without properties, filters or text", () => {
    const src = `<h2>{{ title | default: "Hi" | append: suffix }}</h2><p>{{ card.body }}</p><a href="{{ url }}">{{ title }}</a>`;
    assert.deepEqual(partialVariables(src), ["title", "suffix", "card", "url"]);
  });

  it("leaves out site globals, data-source globals and anything the partial defines", () => {
    const src = `{{ site.name }}{{ company.phone }}{{ request.path }}{{ products.size }}
{% assign label = heading | upcase %}{% capture note %}{{ extra }}{% endcapture %}
{% for item in items limit: 3 %}{{ item.title }}{{ forloop.index }}{% endfor %}{{ label }}{{ note }}`;
    assert.deepEqual(partialVariables(src, ["products"]), ["heading", "extra", "items"]);
  });

  it("reads conditions, case values and nested render arguments", () => {
    const src = `{% if sticky and page.slug == mode %}x{% elsif size > 2 %}y{% endif %}{% case tone %}{% when 'a' %}z{% endcase %}{% render 'icon', name: icon_name, size: 4 %}`;
    assert.deepEqual(partialVariables(src), ["sticky", "mode", "size", "tone", "icon_name"]);
  });

  it("ignores comments, raw blocks and the schema", () => {
    const src = `{% comment %}{{ ghost }}{% endcomment %}{% raw %}{{ raw }}{% endraw %}{% schema %}{"name":"x"}{% endschema %}{{ real }}`;
    assert.deepEqual(partialVariables(src), ["real"]);
  });

  it("a partial that uses none gives an empty list", () => {
    assert.deepEqual(partialVariables(`<nav>{{ site.name }}</nav>`), []);
    assert.deepEqual(partialVariables(``), []);
  });
});

describe("valueRows: what the panel lists", () => {
  it("every variable first, set or not, then the arguments the partial doesn't read", () => {
    const rows = valueRows(["title", "url"], [{ name: "url", source: '"/a"' }, { name: "tone", source: "page.tone" }]);
    assert.deepEqual(rows, [
      { name: "title", source: "", custom: false },
      { name: "url", source: '"/a"', custom: false },
      { name: "tone", source: "page.tone", custom: true },
    ]);
  });

  it("names a render argument can have", () => {
    assert.ok(isValueName("title") && isValueName("btn-label") && isValueName("_x1"));
    assert.ok(!isValueName("") && !isValueName("2x") && !isValueName("a b") && !isValueName("a:b"));
  });
});
