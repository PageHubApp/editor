import { test } from "node:test";
import assert from "node:assert/strict";
import { readSite, openSite, rendererOf, changedLines, errors } from "../_shared/headless.ts";
import { htmlKit, tailwindKit, liquidKit, inlineText } from "@pagehub/engine/kits";

const files = readSite(new URL("./site", import.meta.url).pathname);
const PAGES = ["index.html", "about.html", "contact.html"];
const open = () => openSite(files, { extensions: [htmlKit(), tailwindKit(), liquidKit(), inlineText()] });

test("plain-html: the site is three pages, a stylesheet and the gallery images", () => {
  assert.deepEqual(Object.keys(files).filter((p) => p.endsWith(".html")).sort(), [...PAGES].sort());
  assert.ok(files["assets/styles.css"]);
});

test("plain-html: every page parses and has no error-level diagnostics", () => {
  const e = open();
  assert.deepEqual(errors(e).map((d) => `${d.path}: ${d.message}`), []);
});

test("plain-html: no Liquid, so each page renders to exactly its source", async () => {
  const e = open();
  const r = await rendererOf(e);
  for (const p of PAGES) assert.equal(await r.render(p, {}), files[p], p);
});

test("plain-html: a text edit is a one-line diff", () => {
  const e = open();
  e.select(e.get("h1", "index.html"));
  assert.ok(e.run("text.setInner", { target: e.get("h1", "index.html"), source: "Hand-thrown pottery from the quay" }));
  const diff = changedLines(files["index.html"]!, e.text("index.html"));
  assert.deepEqual(diff, { removed: 1, added: 1 });
});

test("plain-html: native behaviours are untouched markup (dialog + commandfor, popover, details name, data-autoplay)", () => {
  const home = files["index.html"]!;
  assert.ok(home.includes('commandfor="visit"') && home.includes('<dialog id="visit">'));
  assert.ok(home.includes('<details name="faq"'));
  assert.ok(home.includes("data-autoplay"));
  assert.ok(files["about.html"]!.includes('popovertarget="menu"') && files["about.html"]!.includes("popover>"));
});
