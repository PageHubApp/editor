import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/liquid/engine.ts";
import { builtinFilters, TRUSTED_HTML_FILTERS } from "../src/runtime/filters/builtinFilters.ts";
import { HostMissingError, type HostProviders } from "../src/runtime/filters/types.ts";

const host: HostProviders = {
  imageUrl: (id, o) => `https://cdn.example/${id}/w=${o.width ?? "public"}${o.format ? "." + o.format : ""}`,
  fileUrl: (n) => `/files/${n}`,
  icon: (ref) => (ref === "tb/TbPhone" ? `<svg data-icon="${ref}"></svg>` : undefined),
};
const liquid = createEngine({ filters: builtinFilters(host) });
const r = (tpl: string, data: Record<string, unknown> = {}) => liquid.parseAndRender(tpl, data);

test("handleize — https://shopify.dev/docs/api/liquid/filters/handleize", async () => {
  assert.equal(await r(`{{ '100% M & Ms!!!' | handleize }}`), "100-m-ms");
  assert.equal(await r(`{{ 'Health & Beauty' | handleize }}`), "health-beauty");
  assert.equal(await r(`{{ 'Café Crème' | handleize }}`), "cafe-creme");
});

test("data_items wraps split strings and primitive arrays as rows", async () => {
  assert.equal(await r(`{% assign rs = s | data_items: ',' %}{% for x in rs %}[{{x.value}}|{{x.slug}}]{% endfor %}`, { s: "A b, C" }), "[A b|a-b][C|c]");
  assert.equal(await r(`{% assign ra = a | data_items %}{% for x in ra %}{{x.src}}{{x.n}}{% endfor %}`, { a: ["u1", { n: 2 }] }), "u12");
});

test("where one-arg keeps rows whose field is truthy", async () => {
  assert.equal(await r(`{% assign x = rows | where: 'f' %}{% for i in x %}{{i.t}}{% endfor %}`, { rows: [{ t: "a", f: 1 }, { t: "b", f: null }, { t: "c", f: "x" }] }), "ac");
});

test("where matches a scalar field or a list field that contains the value", async () => {
  const rows = [{ t: "a", categories: ["apparel", "bags"], sub: "bags" }, { t: "b", categories: ["home"], sub: "bags" }, { t: "c", metadata: { sub: "x" } }];
  assert.equal(await r(`{% assign x = rows | where: 'categories', 'apparel' %}{% for i in x %}{{i.t}}{% endfor %}`, { rows }), "a");
  assert.equal(await r(`{% assign x = rows | where: 'sub', 'bags' %}{% for i in x %}{{i.t}}{% endfor %}`, { rows }), "ab");
  assert.equal(await r(`{% assign x = rows | where: 'sub', 'x' %}{% for i in x %}{{i.t}}{% endfor %}`, { rows }), "c");
});

test("facets folds rows into per-key value counts (count desc, then value)", async () => {
  const rows = [{ c: ["red", "blue"], s: "m" }, { c: "red, green", s: "l" }, { metadata: { s: "m" } }];
  const out = await r(`{% assign f = rows | facets: 'c, s, none' %}{% for x in f %}{{x.title}}:{% for v in x.metadata.values %}{{v.value}}={{v.count}}{% unless forloop.last %},{% endunless %}{% endfor %};{% endfor %}`, { rows });
  assert.equal(out, "C:red=2,blue=1,green=1;S:m=2,l=1;None:;");
});

test("pluralize — https://shopify.dev/docs/api/liquid/filters/pluralize", async () => {
  assert.equal(await r(`{{ 1 | pluralize: 'item', 'items' }}`), "item");
  assert.equal(await r(`{{ 3 | pluralize: 'item', 'items' }}`), "items");
  assert.equal(await r(`{{ 0 | pluralize: 'item', 'items' }}`), "items");
});

test("dates render in the site's timezone (Shopify): an offset string shifts, a wall-clock string and a date-only string do not", async () => {
  const la = createEngine({ filters: builtinFilters(host), timezoneOffset: "America/Los_Angeles" });
  const tz = (tpl: string) => la.parseAndRender(tpl);
  assert.equal(await tz(`{{ '2026-06-15T02:00:00Z' | date: '%Y-%m-%d %H:%M' }}`), "2026-06-14 19:00");
  assert.equal(await tz(`{{ '2026-06-15T10:00:00+02:00' | date: '%Y-%m-%d %H:%M' }}`), "2026-06-15 01:00");
  assert.equal(await tz(`{{ '2026-06-15' | date: '%Y-%m-%d %H:%M' }}`), "2026-06-15 00:00");
  assert.equal(await tz(`{{ '2026-06-15 10:30' | date: '%Y-%m-%d %H:%M' }}`), "2026-06-15 10:30");
  assert.equal(await tz(`{{ '2026-06-15' | time_tag: '%B %d' }}`), `<time datetime="2026-06-15">June 15</time>`);
  assert.equal(await tz(`{{ '2026-06-15T02:00:00Z' | time_tag: '%d %H' }}`), `<time datetime="2026-06-15T02:00:00Z">14 19</time>`);
  const now = await tz(`{{ 'now' | date: '%Y-%m-%d %H' }}`);
  const expected = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(new Date()).replace(",", "");
  assert.equal(now, expected, "'now' is now in the site's zone");
  assert.equal(await liquid.parseAndRender(`{{ '2026-06-15T02:00:00Z' | date: '%Y-%m-%d %H:%M' }}`), "2026-06-15 02:00", "no zone set: UTC");
});

test("time_tag — https://shopify.dev/docs/api/liquid/filters/time_tag (UTC, escaped)", async () => {
  assert.equal(
    await r(`{{ d | time_tag: '%B %d, %Y' }}`, { d: "2022-04-14T22:40:00Z" }),
    `<time datetime="2022-04-14T22:40:00Z">April 14, 2022</time>`,
  );
  assert.equal(await r(`{{ '2026-06-15' | time_tag: 'abbreviated_date' }}`), `<time datetime="2026-06-15">Jun 15, 2026</time>`);
  assert.equal(await r(`{{ '2026-06-15' | time_tag: class: 'when', format: '%Y' }}`), `<time datetime="2026-06-15" class="when">2026</time>`);
  assert.equal(await r(`{{ 'not a date' | time_tag }}`), "");
  assert.equal(await r(`{{ nothing | time_tag }}`), "");
});

test("link_to — https://shopify.dev/docs/api/liquid/filters/link_to (escapes text, drops javascript: urls)", async () => {
  assert.equal(await r(`{{ 'Shopify' | link_to: 'https://shopify.com', title: 'Shopify' }}`), `<a href="https://shopify.com" title="Shopify">Shopify</a>`);
  assert.equal(await r(`{{ t | link_to: '/x' }}`, { t: "<script>" }), `<a href="/x">&lt;script&gt;</a>`);
  assert.equal(await r(`{{ 'x' | link_to: 'javascript:alert(1)' }}`), `<a href="">x</a>`);
  assert.equal(await r(`{{ 'x' | link_to: '/a', target: '_blank' }}`), `<a href="/a" target="_blank" rel="noopener">x</a>`);
  assert.equal(await r(`{{ 'x' | link_to: '/a', title: '" onclick="y' }}`), `<a href="/a" title="&quot; onclick=&quot;y">x</a>`);
});

test("money / money_with_currency — minor units; currency and lang options", async () => {
  assert.equal(await r(`{{ 4999 | money }}`), "$49.99");
  assert.equal(await r(`{{ 4999 | money_with_currency }}`), "$49.99 USD");
  assert.equal((await r(`{{ 123456 | money: currency: "EUR", lang: "de" }}`)).replace(/ /g, " "), "1.234,56 €");
  assert.equal((await r(`{{ 123456 | money_with_currency: currency: "EUR", lang: "de" }}`)).replace(/ /g, " "), "1.234,56 € EUR");
  assert.equal(await r(`{{ 500 | money: currency: "JPY" }}`), "¥500"); // zero-decimal currency
  assert.equal(await r(`{{ 4999 | money }}`, { site: { currency: "GBP", lang: "en-GB" } }), "£49.99");
  assert.equal(await r(`{{ nothing | money }}`), "");
});

const pag = (current: number, pages: number) => ({
  current_page: current,
  previous: current > 1 ? { title: "Previous", url: `/p?page=${current - 1}`, number: current - 1 } : null,
  next: current < pages ? { title: "Next", url: `/p?page=${current + 1}`, number: current + 1 } : null,
  parts: Array.from({ length: pages }, (_, i) => ({ title: String(i + 1), url: `/p?page=${i + 1}`, is_link: i + 1 !== current })),
});

test("default_pagination — https://shopify.dev/docs/api/liquid/filters/default_pagination", async () => {
  assert.equal(
    await r(`{{ paginate | default_pagination }}`, { paginate: pag(2, 3) }),
    [
      `<span class="prev"><a href="/p?page=1" title="">&laquo; Previous</a></span>`,
      `<span class="page"><a href="/p?page=1" title="">1</a></span>`,
      `<span class="page current">2</span>`,
      `<span class="page"><a href="/p?page=3" title="">3</a></span>`,
      `<span class="next"><a href="/p?page=4" title="">Next &raquo;</a></span>`.replace("page=4", "page=3"),
    ].join(" "),
  );
  const long = await r(`{{ paginate | default_pagination: next: 'More <' }}`, { paginate: pag(10, 20) });
  assert.ok(long.includes(`<span class="deco">&hellip;</span>`) && long.includes("More &lt;"));
  assert.ok(long.includes(`>20</a>`) && long.includes(`>1</a>`) && !long.includes(`>5</a>`));
  assert.equal(await r(`{{ paginate | default_pagination }}`, { paginate: pag(1, 1) }), "");
});

test("default_errors — https://shopify.dev/docs/api/liquid/filters/default_errors", async () => {
  assert.equal(
    await r(`{{ errors | default_errors }}`, { errors: [{ field: "email", message: "Enter a valid email" }, "Too <fast>"] }),
    `<div class="errors"><ul><li>Enter a valid email</li><li>Too &lt;fast&gt;</li></ul></div>`,
  );
  assert.equal(await r(`{{ errors | default_errors }}`, { errors: [] }), "");
});

test("image_tag — https://shopify.dev/docs/api/liquid/filters/image_tag (escapes alt)", async () => {
  assert.equal(
    await r(`{{ 'https://cdn.example/a.jpg' | image_tag: alt: 'Say "hi" <b>', width: 300 }}`),
    `<img src="https://cdn.example/a.jpg" alt="Say &quot;hi&quot; &lt;b&gt;" loading="lazy" width="300">`,
  );
  assert.equal(await r(`{{ 'https://cdn.example/a.jpg' | image_tag }}`), `<img src="https://cdn.example/a.jpg" alt="" loading="lazy">`);
  assert.equal(await r(`{{ 'javascript:x' | image_tag }}`), "");
  assert.equal(await r(`{{ '' | image_tag }}`), "");
  assert.ok(!(await r(`{{ 'https://x/a.jpg' | image_tag: onerror: 'x()' }}`)).includes("onerror"));
});

test("image_url / file_url / icon use the host; unknown icon renders nothing", async () => {
  assert.equal(await r(`{{ 'k3j9' | image_url: width: 1600 }}`), "https://cdn.example/k3j9/w=1600");
  assert.equal(await r(`{{ 'k3j9' | image_url }}`), "https://cdn.example/k3j9/w=public");
  assert.equal(await r(`{{ nothing | image_url: width: 1 }}`), "");
  assert.equal(await r(`{{ 'menu.pdf' | file_url }}`), "/files/menu.pdf");
  assert.equal(await r(`{{ 'tb/TbPhone' | icon | raw }}`), `<svg data-icon="tb/TbPhone"></svg>`);
  assert.equal(await r(`{{ 'tb/TbPhone' | icon }}`), `<svg data-icon="tb/TbPhone"></svg>`); // trusted: unescaped at the end of a chain
  assert.equal(await r(`{{ 'tb/TbPhone' | icon | upcase }}`), `&lt;SVG DATA-ICON=&#34;TB/TBPHONE&#34;&gt;&lt;/SVG&gt;`); // not last: escaped again
  assert.equal(await r(`{{ 'tb/Nope' | icon | raw }}`), "");
});

test("host-backed filters: absent provider means unregistered; asking for one throws at creation", async () => {
  const bare = createEngine({ filters: builtinFilters({}) });
  await assert.rejects(bare.parseAndRender(`{{ 'x' | icon }}`), /undefined filter/);
  assert.equal(await bare.parseAndRender(`{{ 'A b' | handleize }}`), "a-b");
  assert.throws(() => builtinFilters({}, { include: ["icon", "handleize", "file_url"] }), (e) => e instanceof HostMissingError && e.filters.sort().join() === "file_url,icon");
  assert.throws(() => builtinFilters({}, { include: ["nope"] }), /unknown built-in filter/);
});

test("html-returning filters are the trusted set", () => {
  assert.deepEqual([...TRUSTED_HTML_FILTERS].sort(), ["default_errors", "default_pagination", "icon", "image_tag", "link_to", "time_tag"]);
});
