import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importHtml, escapeLiquid } from "../src/import/importHtml.ts";
import { importSite, liftPartials } from "../src/import/importSite.ts";
import { createRenderer } from "../src/runtime/createRenderer.ts";
import { parseSource } from "../src/parse/parse.ts";

const fixture = (n: string) => fs.readFileSync(new URL(`./fixtures/import/${n}`, import.meta.url), "utf8");
const renderAll = (files: Record<string, string>, path: string) => createRenderer({ files: (p) => files[p] }).render(path, {});
const ws = (s: string) => s.replace(/\s+/g, " ").trim();

test("Vue / Angular / Handlebars / code samples with {{ and {% render back byte for byte", async () => {
  const html = fixture("vue.html");
  const { source, report } = importHtml(html);
  assert.ok(!report.normalised, report.firstError);
  assert.ok(report.escapes.textRaw >= 3);
  assert.ok(report.escapes.textInline >= 1, "text containing endraw is escaped inline");
  assert.ok(report.escapes.attrs >= 2);
  assert.equal(report.escapes.comments, 1);
  assert.deepEqual(report.remaining, []);
  // the x-template <script> is the page's own: kept (its braces made literal outputs) and listed
  assert.deepEqual(report.sanitized, []);
  assert.deepEqual(report.scripts, ["inline <script>"]);
  assert.equal(await renderAll({ "pages/v.liquid": source }, "pages/v.liquid"), html);
});

test("without sanitize the script body is kept and renders unchanged", async () => {
  const html = fixture("vue.html");
  const { source } = importHtml(html, { sanitize: false });
  assert.equal(await renderAll({ "pages/v.liquid": source }, "pages/v.liquid"), html);
});

test("escapeLiquid keeps single-quoted and unquoted attributes valid, and drops Liquid in attribute names", () => {
  const { source, droppedAttrs } = escapeLiquid(`<a title='x {{ y }}' data-a={{z}} {{#if q}}>t</a>`);
  assert.ok(!droppedAttrs || droppedAttrs >= 1);
  assert.match(source, /title='x \{\{ "\{\{" \}\} y \}\}'/);
  assert.match(source, /data-a="\{\{ '\{\{' \}\}z\}\}"/);
});

test("messy HTML normalises, parses strict and lints clean; visible content survives", async () => {
  const { source, report } = importHtml(fixture("messy.html"));
  assert.ok(report.normalised);
  assert.ok(report.firstError);
  parseSource(source, "strict");
  assert.deepEqual(report.remaining, []);
  assert.ok(report.scripts.length > 0, "the handlers it carries are listed");
  assert.match(source, /onclick|javascript:/, "and kept");
  const out = ws(await renderAll({ "p.liquid": source }, "p.liquid"));
  for (const t of ["First paragraph", "Second paragraph", "bold", "both", "italic", "one", "two", "a", "b", "c", "d", "link", "Click", "me"]) assert.ok(out.includes(t), t);
  assert.match(out, /<p>First paragraph\s*<\/p>/);
  assert.match(out, /<li>one\s*<\/li>/);
  assert.match(out, /<tbody>/);
  assert.match(out, /<a href="\/x">link<\/a>/);
});

test("unclosed p/li/td, stray closing tags and misnesting each import on their own", () => {
  for (const html of [
    `<div><p>a<p>b</div>`,
    `<ul><li>a<li>b</ul>`,
    `<table><tr><td>a<td>b</table>`,
    `<div>a</div></div>`,
    `<b><i>x</b>y</i>`,
    `<A href="/">x</a>`,
  ]) {
    const { source, report } = importHtml(html);
    parseSource(source, "strict");
    assert.deepEqual(report.remaining, [], html);
  }
});

test("well-formed pages keep their formatting; fragments get no html/body wrapper", () => {
  const html = `<section>\n  <h2 class="a">Hi</h2>\n  <p>there</p>\n</section>\n`;
  const { source, report } = importHtml(html);
  assert.equal(source, html);
  assert.ok(!report.normalised);
  const frag = importHtml(`<p>one<p>two`);
  assert.ok(!/<html|<body/.test(frag.source));
});

const page = (header: string, body: string, footer = `<footer><p>(c) Acme</p></footer>`) =>
  `<!DOCTYPE html>\n<html>\n<head><title>t</title></head>\n<body>\n${header}\n<main>${body}</main>\n${footer}\n</body>\n</html>\n`;
const H = `<header><a href="/">Acme</a> <nav><a href="/a">A</a></nav></header>`;

test("a header shared by 3 pages lifts once; a different header is not lifted for that page", async () => {
  const site = {
    "index.html": page(H, "home"),
    "about.html": page(H, "about"),
    "team.html": page(H, "team"),
    "odd.html": page(`<header><a href="/">Other</a></header>`, "odd"),
  };
  const { files, report } = importSite(site);
  assert.deepEqual(Object.keys(files).filter((f) => f.startsWith("partials/")).sort(), ["partials/footer.liquid", "partials/header.liquid"]);
  assert.deepEqual(report.lifted["partials/header.liquid"]!.sort(), ["pages/about.liquid", "pages/index.liquid", "pages/team.liquid"]);
  assert.match(files["pages/index.liquid"]!, /\{% render 'header' %\}/);
  assert.ok(!files["pages/odd.liquid"]!.includes("render 'header'"));
  assert.ok(files["pages/odd.liquid"]!.includes("Other"));
  assert.equal(files["partials/header.liquid"], H + "\n");
  const lookup = (p: string) => files[p];
  const out = await createRenderer({ files: lookup }).render("pages/about.liquid", {});
  assert.equal(ws(out), ws(site["about.html"]));
});

test("a header on one page only is not lifted; min is honoured; only top-level elements lift", () => {
  const one = liftPartials({ "a.liquid": page(H, "a") });
  assert.ok(!Object.keys(one.partials).includes("partials/header.liquid"));
  const nested = `<body><div><header>x</header></div></body>`;
  const r = liftPartials({ "a.liquid": nested, "b.liquid": nested });
  assert.deepEqual(r.partials, {});
  const three = liftPartials({ "a.liquid": page(H, "a"), "b.liquid": page(H, "b") }, { min: 3 });
  assert.deepEqual(three.partials, {});
});

test("non-HTML files pass through; reports list per-page escapes", () => {
  const { files, report } = importSite({ "index.html": `<p>{{ x }}</p>`, "assets/site.css": "a{}" });
  assert.equal(files["assets/site.css"], "a{}");
  assert.deepEqual(report.passthrough, ["assets/site.css"]);
  assert.equal(report.pages["pages/index.liquid"]!.escapes.textRaw, 1);
});
