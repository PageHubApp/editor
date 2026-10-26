import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSource,
  formatSiteFiles,
  scanCss,
  emptyHints,
  siteLayoutHints,
  lint,
  insert,
  move,
  remove,
  setAttribute,
  setText,
  wrap,
  parseSource,
  allNodes,
  isElement,
  elementName,
  NodeTypes,
  type ElementNode,
} from "../src/index.ts";
import { createRenderer } from "../src/render.ts";

const env = createRenderer({ files: () => undefined }).parserEnvironment;
const fmt = (src: string, css?: string) => formatSource(src, { env, hints: css === undefined ? undefined : scanCss(css) });
const onlyWhitespace = (a: string, b: string) => assert.equal(a.replace(/[ \t\n\r\f]+/g, ""), b.replace(/[ \t\n\r\f]+/g, ""));

function check(src: string, want: string, css?: string) {
  const out = fmt(src, css);
  assert.equal(out, want);
  onlyWhitespace(src, out);
  assert.equal(fmt(out, css), out, "idempotent");
  assert.equal(lint(out, { env }).length, lint(src, { env }).length, "lints the same");
}

test("format: block children each get a line, indented two spaces", () => {
  check(
    `<section class="w-full"><div class="max-w-page"><h2>Title</h2><p>One</p></div></section>`,
    `<section class="w-full">\n  <div class="max-w-page">\n    <h2>Title</h2>\n    <p>One</p>\n  </div>\n</section>`,
  );
});

test("format: text and inline formatting are left as they are", () => {
  const prose = `<div><p>Call <a href="tel:1">us</a> <b>today</b>, or <em>email</em>.</p></div>`;
  check(prose, `<div>\n  <p>Call <a href="tel:1">us</a> <b>today</b>, or <em>email</em>.</p>\n</div>`);
  // Two inline siblings in a block container: whitespace between them would render a space.
  check(`<div><span>a</span><span>b</span></div>`, `<div><span>a</span><span>b</span></div>`);
  check(`<p><img src="a"><img src="b"></p>`, `<p><img src="a"><img src="b"></p>`);
});

test("format: flex and grid children break anywhere, even inline ones", () => {
  check(
    `<div class="flex gap-2"><span>a</span><a href="/">b</a><img src="x"></div>`,
    `<div class="flex gap-2">\n  <span>a</span>\n  <a href="/">b</a>\n  <img src="x">\n</div>`,
  );
  check(`<ul class="grid"><li>a</li><li>b</li></ul>`, `<ul class="grid">\n  <li>a</li>\n  <li>b</li>\n</ul>`);
});

test("format: an inline-block or display:contents element keeps its neighbours", () => {
  check(`<div><div class="inline-block">a</div><div class="inline-block">b</div></div>`, `<div><div class="inline-block">a</div><div class="inline-block">b</div></div>`);
  check(`<div><div class="md:inline-flex">a</div><div>b</div></div>`, `<div><div class="md:inline-flex">a</div>\n  <div>b</div>\n</div>`);
  // display:contents lifts its children into the parent: nothing around it is proven.
  check(`<div><span>x</span><div style="display: contents"><span>a</span></div></div>`, `<div><span>x</span><div style="display: contents"><span>a</span></div></div>`);
});

test("format: pre, textarea, script, style, raw and capture are never touched", () => {
  for (const src of [
    `<pre><div>a</div><div>b</div></pre>`,
    `<div class="whitespace-pre-line"><div>a</div><div>b</div></div>`,
    `<div style="white-space: pre-wrap"><div>a</div><div>b</div></div>`,
    `<textarea><div>a</div></textarea>`,
  ]) check(src, src);
  check(
    `<div><script>var a = 1;</script><style>.a{color:red}</style><div>b</div></div>`,
    `<div>\n  <script>var a = 1;</script>\n  <style>.a{color:red}</style>\n  <div>b</div>\n</div>`,
  );
  check(`<div>{% raw %}<div>a</div><div>b</div>{% endraw %}</div>`, `<div>{% raw %}<div>a</div><div>b</div>{% endraw %}</div>`);
  check(`<div>{% capture x %}<div>a</div><div>b</div>{% endcapture %}<div>c</div></div>`, `<div>\n  {% capture x %}<div>a</div><div>b</div>{% endcapture %}\n  <div>c</div>\n</div>`);
});

test("format: Liquid blocks at block level get their own lines, branches indented", () => {
  check(
    `<div>{% if a %}<div>x</div>{% elsif b %}<div>y</div>{% else %}<section>z</section>{% endif %}{% for i in list %}<article>{{ i }}</article>{% endfor %}</div>`,
    [
      `<div>`,
      `  {% if a %}`,
      `    <div>x</div>`,
      `  {% elsif b %}`,
      `    <div>y</div>`,
      `  {% else %}`,
      `    <section>z</section>`,
      `  {% endif %}`,
      `  {% for i in list %}`,
      `    <article>{{ i }}</article>`,
      `  {% endfor %}`,
      `</div>`,
    ].join("\n"),
  );
  // Inside a paragraph a Liquid block is inline content: untouched.
  check(`<p>Hi {% if a %}<b>you</b>{% endif %}!</p>`, `<p>Hi {% if a %}<b>you</b>{% endif %}!</p>`);
});

test("format: Liquid output and render calls only break next to a block-level element", () => {
  check(`<div>{{ a }}{{ b }}<div>c</div></div>`, `<div>{{ a }}{{ b }}\n  <div>c</div>\n</div>`);
  check(`<main class="flex flex-col">{% render 'header' %}{% render 'nav' %}<article>x</article></main>`, `<main class="flex flex-col">{% render 'header' %}{% render 'nav' %}\n  <article>x</article>\n</main>`);
});

test("format: existing whitespace is re-indented, one blank line kept", () => {
  check(`<div>\n<div>a</div>\n\n\n        <div>b</div></div>`, `<div>\n  <div>a</div>\n\n  <div>b</div>\n</div>`);
  // Whitespace between inline siblings already renders a space: any amount of it renders the same.
  check(`<div class="block"><span>a</span>   <span>b</span></div>`, `<div class="block"><span>a</span>\n  <span>b</span></div>`);
});

test("format: a {% form %} is a <form> laid out by its class argument", () => {
  check(
    `<div>{% form 'contact', class: "flex flex-col" %}<input name="a"><button>Go</button>{% endform %}</div>`,
    `<div>\n  {% form 'contact', class: "flex flex-col" %}\n    <input name="a">\n    <button>Go</button>\n  {% endform %}\n</div>`,
  );
});

test("format: hidden and absolutely positioned children don't make a line edge", () => {
  // Every child block or hidden: whitespace sits between block boxes only.
  check(`<div><div class="hidden md:block">a</div><div>b</div></div>`, `<div>\n  <div class="hidden md:block">a</div>\n  <div>b</div>\n</div>`);
  // Next to inline content, an absolutely positioned box is no line edge.
  check(`<div>{{ x }}<span class="absolute">a</span></div>`, `<div>{{ x }}<span class="absolute">a</span></div>`);
  // A ::before can put inline content at the container's edge.
  check(`<div class="before:content-['x']"><div class="hidden">a</div></div>`, `<div class="before:content-['x']"><div class="hidden">a</div></div>`);
});

test("scanCss: component and site rules change what is proven", () => {
  // `.badge` is inline-flex: a div carrying it is no block.
  check(`<div><div class="badge">a</div><div class="badge">b</div></div>`, `<div><div class="badge">a</div><div class="badge">b</div></div>`, `.badge{display:inline-flex}`);
  check(`<div><div class="badge">a</div><div class="badge">b</div></div>`, `<div>\n  <div class="badge">a</div>\n  <div class="badge">b</div>\n</div>`, ``);
  check(`<nav><li>a</li><li>b</li></nav>`, `<nav><li>a</li><li>b</li></nav>`, `.menu li{display:inline-block}`);
  check(`<div class="row"><div>a</div><div>b</div></div>`, `<div class="row"><div>a</div><div>b</div></div>`, `.row > *{display:inline}`);
  check(`<div class="x"><div>a</div><div>b</div></div>`, `<div class="x"><div>a</div><div>b</div></div>`, `.x{white-space:pre-line}`);
  check(`<div class="x"><div>a</div><div>b</div></div>`, `<div class="x"><div>a</div><div>b</div></div>`, `@media (min-width:1px){.x{& > div{display:inline}}}`);
  // Generated content on a pseudo-element, only when it sets `content`.
  assert.equal(scanCss(`.x::before{content:"";display:block}`).classes.get("x")?.pseudo, true);
  assert.equal(scanCss(`*,::before,::after{box-sizing:border-box}`).global, false);
  // Unattributable rules and remote stylesheets: nothing is formatted.
  for (const css of [`*{white-space:pre}`, `body{white-space:pre-wrap}`, `:not(.a){display:inline}`, `@import url("https://cdn.example/x.css");`]) {
    assert.equal(scanCss(css).global, true, css);
  }
  assert.equal(scanCss(`@import url("https://fonts.googleapis.com/css2?family=Inter");`).global, false);
  assert.equal(scanCss(`.btn:where(:not([data-daisyui="off"] *)){display:inline-flex}`).classes.get("btn")?.display.has("inline-flex"), true);
  assert.equal(scanCss(`.md\\:flex{display:flex}`).classes.has("md:flex"), true);
});

test("formatSiteFiles: site CSS, remote stylesheets, partials rendered where whitespace is kept", () => {
  const files = {
    "theme.css": `.chip{display:inline-block}`,
    "pages/index.liquid": `<main><div class="chip">a</div><div class="chip">b</div><div><p>x</p><p>y</p></div><pre>{% render 'code' %}</pre>{% render 'card' %}</main>`,
    "partials/code.liquid": `<div><span>a</span></div><div>b</div>`,
    "partials/card.liquid": `<div><p>a</p><p>b</p></div>`,
    "emails/receipt.liquid": `<table><tr><td>a</td></tr></table>`,
    "site.json": `{}`,
  };
  const out = formatSiteFiles(files, { env });
  assert.equal(out["pages/index.liquid"], `<main><div class="chip">a</div><div class="chip">b</div>\n  <div>\n    <p>x</p>\n    <p>y</p>\n  </div>\n  <pre>{% render 'code' %}</pre>\n  {% render 'card' %}</main>`);
  assert.equal(out["partials/code.liquid"], files["partials/code.liquid"], "rendered inside <pre>");
  assert.equal(out["partials/card.liquid"], `<div>\n  <p>a</p>\n  <p>b</p>\n</div>`);
  assert.equal(out["emails/receipt.liquid"], files["emails/receipt.liquid"]);
  assert.equal(out["site.json"], files["site.json"]);

  const linked = { ...files, "partials/head.liquid": `<link rel="stylesheet" href="https://cdn.example/site.css">` };
  assert.equal(siteLayoutHints(linked).global, true);
  assert.deepEqual(formatSiteFiles(linked, { env }), linked);
  const fonts = { ...files, "partials/head.liquid": `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">` };
  assert.equal(siteLayoutHints(fonts).global, false);
  assert.equal(formatSiteFiles({ "pages/a.liquid": `<div><div>a</div></div>`, "theme.css": `.x{display:{{ y }}}` }, { env })["pages/a.liquid"], `<div><div>a</div></div>`);
  assert.equal(emptyHints().global, false);
});

test("formatSiteFiles: hostile stylesheets are read in linear time and never throw (every save formats the site)", () => {
  const timed = (what: string, files: Record<string, string>) => {
    const t = Date.now();
    assert.doesNotThrow(() => formatSiteFiles(files, { env }), what);
    assert.ok(Date.now() - t < 3000, `${what}: ${Date.now() - t} ms`);
  };
  const page = `<div><div>a</div></div>`;
  // Unclosed openers: a lazy `[\s\S]*?` regex rescanned the rest of the file from each one (minutes at 2 MB).
  timed("<style> openers in a script", { "pages/index.liquid": `${page}<script>var s = "${"<style>".repeat(150_000)}";</script>` });
  timed("{% style %} openers in a comment", { "pages/index.liquid": `${page}{% comment %}${"{% style %}".repeat(100_000)}{% endcomment %}` });
  timed("<link openers in a script", { "pages/index.liquid": `${page}<script>var s = "${"<link ".repeat(150_000)}";</script>` });
  timed("unclosed /* comments", { "pages/index.liquid": page, "theme.css": "/* ".repeat(300_000) });
  // Unclosed nesting recursed once per brace: a stack overflow that failed every later save of the site.
  for (const css of ["a{".repeat(50_000), 'a{content:"'.repeat(50_000), "@media x{".repeat(50_000), "a{&b{".repeat(50_000)]) {
    timed(css.slice(0, 12), { "pages/index.liquid": page, "theme.css": css });
    assert.equal(scanCss(css).global, true, "a stylesheet it can't read proves nothing");
  }
  // Ordinary nesting is still read.
  assert.equal(scanCss(`@media (min-width:1px){@supports (x:y){.x{display:inline}}}`).classes.get("x")?.display.has("inline"), true);
});

test("format: unparseable source comes back unchanged", () => {
  assert.equal(fmt(`<div><p>a</div>`), `<div><p>a</div>`);
});

// ── editor round trip: the edit ops keep a formatted file formatted ───────────────────────────────

const FORMATTED = fmt(
  `<main class="flex flex-col"><section class="w-full"><div class="max-w-page mx-auto"><h2>Services</h2><div class="grid"><article class="p-4"><h3>Roofing</h3><p>Roofs.</p></article><article class="p-4"><h3>Siding</h3><p>Siding.</p></article></div></div></section><section class="w-full"><p>Last</p></section></main>`,
);
const els = (src: string) => allNodes(parseSource(src, "strict", { env })).map(([n]) => n).filter(isElement) as ElementNode[];
const el = (src: string, tag: string, nth = 0) => els(src).filter((e) => elementName(e) === tag)[nth]!;

test("editor round trip: every edit op on a formatted file leaves it formatted", () => {
  assert.equal(fmt(FORMATTED), FORMATTED);
  const snippet = fmt(`<article class="p-4"><h3>Windows</h3><p>Windows.</p></article>`);
  const edits: Array<[string, string]> = [
    ["insert after", insert(FORMATTED, snippet, { anchor: el(FORMATTED, "article", 1), where: "after" }).source],
    ["insert before", insert(FORMATTED, snippet, { anchor: el(FORMATTED, "article", 0), where: "before" }).source],
    ["append", insert(FORMATTED, snippet, { parent: el(FORMATTED, "div", 1) as any, where: "append" }).source],
    ["move", move(FORMATTED, el(FORMATTED, "article", 1), { anchor: el(FORMATTED, "article", 0), where: "before" }).source],
    ["move to another section", move(FORMATTED, el(FORMATTED, "h2"), { anchor: el(FORMATTED, "p", 2), where: "after" }).source],
    ["remove", remove(FORMATTED, el(FORMATTED, "article", 0)).source],
    ["set attribute", setAttribute(FORMATTED, el(FORMATTED, "section", 0), "class", "w-full bg-base-200").source],
    ["set text", setText(FORMATTED, (el(FORMATTED, "h3", 0) as any).children.find((c: any) => c.type === NodeTypes.TextNode), "Roof repair").source],
    ["wrap in a Liquid block", wrap(FORMATTED, el(FORMATTED, "article", 0), "{% if show %}", "{% endif %}").source],
  ];
  for (const [label, src] of edits) assert.equal(fmt(src), src, label);
});
