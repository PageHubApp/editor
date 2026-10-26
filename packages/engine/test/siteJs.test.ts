// A site's own JavaScript (docs/action-items/specs/site-js-allowed.md): `{% javascript %}`, `asset_url`, and that
// inline scripts and handlers render as written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/runtime/createRenderer.ts";
import { lint } from "../src/index.ts";
import { withPageScripts } from "../src/runtime/tags/javascript.ts";

const render = (files: Record<string, string>, path = "pages/index.liquid", host?: { assetUrl?(n: string): string }) =>
  createRenderer({ files: (p) => files[p], ...(host ? { host } : {}) }).render(path, {});

test("{% javascript %} renders nothing in place; each distinct block is added once, at the end of <body>", async () => {
  const card = `<div class="card">{{ title }}</div>{% javascript %}document.querySelectorAll('.card').forEach(c => c.dataset.ok = "{{ not liquid }}");{% endjavascript %}`;
  const html = await render({
    "pages/index.liquid": `<html><body><main>{% render 'card', title: 'A' %}{% render 'card', title: 'B' %}{% render 'other' %}</main></body></html>`,
    "partials/card.liquid": card,
    "partials/other.liquid": `<p>o</p>{% javascript %}console.log("</script>")\n{% endjavascript %}`,
  });
  assert.equal(html.match(/data-ph-javascript/g)?.length, 1, "one <script>");
  assert.equal(html.match(/querySelectorAll\('\.card'\)/g)?.length, 1, "the card's block once, though it rendered twice");
  assert.match(html, /c\.dataset\.ok = "\{\{ not liquid \}\}"/, "the body is raw: no Liquid runs inside it");
  assert.match(html, /console\.log\("<\\\/script>"\)/, "a </script> in the code can't end the element");
  assert.ok(html.indexOf("<script data-ph-javascript") > html.indexOf("</main>") && html.trimEnd().endsWith("</script></body></html>"));
  assert.match(html, /\(function\(\)\{try\{[\s\S]*\}catch\(e\)\{console\.error\(e\)\}\}\)\(\);/, "each block in its own function and try");
});

test("{% javascript %} parses and lints like any built-in; no block, no <script>", async () => {
  assert.deepEqual(lint(`<p>x</p>{% javascript %}if (a < b && c) { go(); }{% endjavascript %}`), []);
  assert.equal(await render({ "pages/index.liquid": "<body><p>x</p></body>" }), "<body><p>x</p></body>");
  assert.equal(withPageScripts("<p>x</p>", new Set(["a()"]), "n0nce"), `<p>x</p><script data-ph-javascript nonce="n0nce">\n(function(){try{\na()\n}catch(e){console.error(e)}})();\n</script>`);
  assert.throws(() => withPageScripts("<p>x</p>", new Set(["a()"]), `x" onload="y`), /invalid CSP nonce/);
});

test("asset_url: a file under assets/ as the host's URL; anything else is empty", async () => {
  const page = `{{ 'app.js' | asset_url }}|{{ '../x.js' | asset_url }}|{{ 'style.css' | asset_url }}|{{ 'a/b.js' | asset_url }}`;
  assert.equal(await render({ "pages/index.liquid": page }), "/assets/app.js|||");
  assert.equal(await render({ "pages/index.liquid": page }, "pages/index.liquid", { assetUrl: (n) => `/v/${n}?h=1` }), "/v/app.js?h=1|||");
});

test("inline <script>, on* handlers and javascript: URLs render as written and lint clean", async () => {
  const src = `<button onclick="go(1)">Go</button><a href="javascript:void 0" onmouseover="hi()">x</a><script>window.x = 1 < 2;</script>`;
  assert.deepEqual(lint(src), []);
  assert.equal(await render({ "pages/index.liquid": src }), src);
});
