import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkSite } from "../src/check.ts";

function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "cli-check-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const pages = (...p: object[]) => JSON.stringify(p);

test("a clean site renders every page with no errors", async () => {
  const r = await checkSite(site({ "pages.json": pages({ path: "index.liquid", url: "/" }, { path: "t.liquid", url: "/t/:slug" }), "index.liquid": "<h1>Hi</h1>", "t.liquid": "<p>{{ request.params.slug }}</p>" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.rendered, 2);
});

test("a pulled hosted folder (pages/, partials/, no pages.json) is checked page by page", async () => {
  const dir = site({
    "site.json": JSON.stringify({ name: "Hosted", company: { name: "Acme" } }),
    "pages/index.liquid": "{% render 'header' %}<h1>{{ company.name }}</h1>",
    "pages/shop/[handle].liquid": "<p>{{ request.params.handle }}</p>",
    "partials/header.liquid": "<header>menu</header>",
  });
  const r = await checkSite(dir);
  assert.deepEqual(r.errors, []);
  assert.equal(r.pages, 2);
  assert.equal(r.rendered, 2);
});

test("the engine's block tags ({% map %}, {% form %}) parse: they are not stray tags", async () => {
  const dir = site({
    "pages/index.liquid": `<div class="h-96">{% map lat: 1, lng: 2, tiles: 'osm' %}<address data-pin="1,2">Shop</address>{% endmap %}</div>{% form 'contact' %}<input name="email">{% endform %}`,
  });
  const r = await checkSite(dir);
  assert.deepEqual(r.errors, []);
});

test("a parse error, a missing page file and an object leak are each reported", async () => {
  const r = await checkSite(
    site({
      "pages.json": pages({ path: "index.liquid", url: "/" }, { path: "gone.liquid", url: "/gone" }, { path: "leak.liquid", url: "/leak" }),
      "index.liquid": "<div><p>unclosed</div>{% if %}",
      "leak.liquid": "<p>{{ data }}</p>",
      "data.json": JSON.stringify({ data: { a: 1 } }),
    }),
  );
  const types = new Set(r.errors.map((e) => e.type));
  assert.ok(types.has("parse"), [...types].join());
  assert.ok(types.has("render-missing-file"));
  assert.ok(types.has("object-object"));
});

test("a host's extra checks run on the rendered pages", async () => {
  const dir = site({ "pages.json": pages({ path: "index.liquid", url: "/" }), "index.liquid": "<p>TODO-MARKER</p>" });
  const r = await checkSite(dir, "s", { extraChecks: [["todo", /TODO-MARKER/g]] });
  assert.deepEqual(r.errors.map((e) => e.type), ["todo"]);
});
