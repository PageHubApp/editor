// `{% seo %}`: a page sets its head from Liquid; a detail page names the row its stored SEO resolves against.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/runtime/createRenderer.ts";
import { lint } from "../src/index.ts";
import type { PageMeta } from "../src/runtime/tags/seo.ts";

async function render(page: string, data: Record<string, unknown> = {}) {
  const pageMeta: PageMeta = { fields: {} };
  const html = await createRenderer({ files: (p) => ({ "pages/x.liquid": page })[p] }).render("pages/x.liquid", data, { pageMeta });
  return { html, pageMeta };
}

const rows = [
  { slug: "a", name: "Alpha", photo: "img-a" },
  { slug: "b", name: "Beta", photo: "img-b" },
];

test("item: the row inside the detail loop; renders nothing", async () => {
  const { html, pageMeta } = await render(
    `{% assign r = rows | where: 'slug', 'b' %}{% for item in r limit: 1 %}{% seo item: item %}<h1>{{ item.name }}</h1>{% endfor %}`,
    { rows },
  );
  assert.equal(html, "<h1>Beta</h1>");
  assert.deepEqual(pageMeta.item, rows[1]);
  assert.deepEqual(pageMeta.fields, {});
});

test("fields: set from expressions, blank ignored, last call wins", async () => {
  const { pageMeta } = await render(
    `{% assign t = 'First' %}{% seo title: t, description: '', image: rows[0].photo %}{% assign t = 'Second' %}{% seo title: t, canonical: 'https://x.test/a' %}`,
    { rows },
  );
  assert.deepEqual(pageMeta.fields, { title: "Second", image: "img-a", canonical: "https://x.test/a" });
  assert.equal(pageMeta.item, undefined);
});

test("item: only a plain object counts", async () => {
  const { pageMeta } = await render(`{% seo item: rows %}{% seo item: 'x' %}`, { rows });
  assert.equal(pageMeta.item, undefined);
});

test("an unknown argument is an error", async () => {
  await assert.rejects(render(`{% seo titel: 'x' %}`), /seo: unknown argument "titel"/);
});

test("{% seo %} parses and lints like any built-in", () => {
  assert.deepEqual(lint(`{% for item in rows limit: 1 %}{% seo item: item, title: item.name %}<p>{{ item.name }}</p>{% endfor %}`), []);
});
