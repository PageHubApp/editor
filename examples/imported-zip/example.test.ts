import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openSite, rendererOf, changedLines, errors, readSite } from "../_shared/headless.ts";
import { lint } from "@pagehub/engine";
import { htmlKit, tailwindKit, liquidKit, inlineText } from "@pagehub/engine/kits";
import { importZip, readZip, summarize } from "./import.ts";
import { unzip, zipFiles } from "./zip.ts";

const zipBytes = readFileSync(new URL("./input/site.zip", import.meta.url));
const imported = importZip(zipBytes);

test("imported-zip: the committed zip is exactly input/site/", () => {
  const src = readSite(new URL("./input/site", import.meta.url).pathname);
  const { text } = readZip(zipBytes);
  assert.deepEqual(text, src);
});

test("imported-zip: the zip reader round-trips what the writer makes", () => {
  const back = unzip(zipFiles({ "a/b.txt": Buffer.from("hello"), "c.bin": Buffer.alloc(300, 7) }));
  assert.equal(back["a/b.txt"]!.toString(), "hello");
  assert.equal(back["c.bin"]!.length, 300);
});

test("imported-zip: the report counts what the import did", () => {
  const { report } = imported;
  assert.deepEqual(Object.keys(report.pages).sort(), ["pages/index.liquid", "pages/menu.liquid", "pages/visit.liquid"]);
  for (const r of Object.values(report.pages)) {
    assert.equal(r.normalised, true, "messy markup was cleaned up once by the HTML parser");
    assert.deepEqual(r.remaining, [], "nothing left that would block a save");
  }
  assert.equal(report.pages["pages/index.liquid"]!.escapes.textRaw, 1, "the Vue {{ }} snippet became literal text");
  assert.deepEqual(report.passthrough, ["css/style.css"]);
});

test("imported-zip: the site's own JavaScript is kept and listed in the report", () => {
  const { files, report } = imported;
  const all = Object.values(files).join("\n");
  assert.match(all, /onclick=|javascript:|<script/i, "nothing stripped");
  for (const f of ["pages/index.liquid", "pages/menu.liquid", "pages/visit.liquid"]) {
    assert.deepEqual(report.pages[f]!.sanitized, [], f);
  }
  assert.ok(Object.values(report.pages).some((r) => r.scripts.length > 0), "each script found is listed");
  assert.match(summarize(report).join("\n"), /script\(s\) kept: /);
});

test("imported-zip: the repeated header and footer are lifted to partials", () => {
  const { files, report } = imported;
  assert.ok(files["partials/header.liquid"]!.startsWith('<header class="top">'));
  assert.ok(files["partials/footer.liquid"]!.startsWith('<footer class="bottom">'));
  for (const f of ["pages/index.liquid", "pages/menu.liquid", "pages/visit.liquid"]) {
    assert.ok(files[f]!.includes("{% render 'header' %}") && files[f]!.includes("{% render 'footer' %}"), f);
  }
  assert.deepEqual(report.lifted["partials/header.liquid"]!.length, 3);
});

test("imported-zip: the result lints clean and renders the page text, Vue braces included", async () => {
  const e = openSite(imported.files, { extensions: [htmlKit(), tailwindKit(), liquidKit(), inlineText()] });
  assert.deepEqual(errors(e).map((d) => `${d.path}: ${d.message}`), []);
  assert.deepEqual(lint(imported.files["pages/index.liquid"]!), []);
  const html = await (await rendererOf(e)).render("pages/index.liquid", {});
  assert.ok(html.includes("Seats free right now: {{ seatsFree }}"));
  assert.ok(html.includes("<header") && html.includes("Bluebird Cafe"));
});

test("imported-zip: the imported site is editable, and an edit is a one-line diff", () => {
  const e = openSite(imported.files, { extensions: [htmlKit(), tailwindKit(), liquidKit(), inlineText()] });
  const h1 = e.get("h1", "pages/index.liquid");
  e.select(h1);
  assert.ok(e.run("text.setInner", { target: h1, source: "Coffee, pastries and a sunny corner" }));
  assert.deepEqual(changedLines(imported.files["pages/index.liquid"]!, e.text("pages/index.liquid")), { removed: 1, added: 1 });
});
