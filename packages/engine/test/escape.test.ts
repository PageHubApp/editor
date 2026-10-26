import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeAttr, escapeHtml, escapeMarkupText } from "../src/render.ts";
import { escapeText } from "../src/index.ts";
import { fontHeadTags } from "../src/canvas.ts";
import { headSnippets } from "../src/runtime/pageHtml.ts";

test("escape: attribute, markup text and html escapes are the one set of helpers", () => {
  assert.equal(escapeAttr(`a&"b<`), "a&amp;&quot;b<");
  assert.equal(escapeMarkupText(`a&<b>"`), `a&amp;&lt;b&gt;"`);
  assert.equal(escapeHtml(`'"&<>`), "&#39;&quot;&amp;&lt;&gt;");
});

test("escape: the edit-op text escape is the markup escape plus Liquid delimiters", () => {
  assert.equal(escapeText("a < {{ b }} & {% c"), "a &lt; {{ '{{' }} b }} &amp; {{ '{%' }} c");
});

test("escape: font links escape their URLs; the CSP nonce is validated, then escaped", () => {
  assert.match(fontHeadTags(['https://x/a"b'], null), /href="https:\/\/x\/a&quot;b"/);
  assert.throws(() => headSnippets("<html data-theme-toggle>", 'a"b'), /invalid CSP nonce/);
  assert.match(headSnippets("<p data-theme-toggle>", "abc123"), /<script nonce="abc123">/);
});
