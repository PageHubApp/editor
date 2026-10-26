import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSource,
  allNodes,
  isLiquidBlock,
  insert,
  move,
  remove,
  replace,
  setAttribute,
  setText,
  wrap,
  setTagArgument,
  EditError,
  NodeTypes,
  type LiquidBlockNode,
  type ElementNode,
} from "../src/index.ts";
import { SAMPLE, findEl, byTag, withAttr, classHas, attrValue, assertMinimalEdit, changedLines, nodesOf } from "./helpers.ts";

const forTag = (src: string) => nodesOf(src).find((n): n is LiquidBlockNode => isLiquidBlock(n) && n.name === "for" && !!(n.markup as unknown as { args?: unknown[] }).args?.length)!;
const textChild = (el: ElementNode) => (el as Extract<ElementNode, { children: unknown }>).children.find((c) => c.type === NodeTypes.TextNode)!;

test("setAttribute: changes only the class value on the hero h1", () => {
  const h1 = findEl(SAMPLE, byTag("h1"));
  const r = setAttribute(SAMPLE, h1, "class", "font-heading text-4xl md:text-7xl tracking-tight");
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  assert.equal(attrValue(findEl(r.source, byTag("h1")), "class"), "font-heading text-4xl md:text-7xl tracking-tight");
  assert.deepEqual(changedLines(SAMPLE, r.source), { removed: 1, added: 1 });
});

test("setAttribute: adds a missing attribute, removes one, rewrites unquoted, rejects a double quote", () => {
  const src = `<div>\n  <img src=a.jpg loading="lazy">\n</div>\n`;
  const img = findEl(src, byTag("img"));
  const added = setAttribute(src, img, "alt", "{{ service.title }}");
  assertMinimalEdit(src, added.source, added.touched);
  assert.match(added.source, /<img src=a.jpg loading="lazy" alt="\{\{ service.title \}\}">/);

  const removed = setAttribute(src, img, "loading", null);
  assert.equal(removed.source, `<div>\n  <img src=a.jpg>\n</div>\n`);

  const requoted = setAttribute(src, img, "src", "b.jpg");
  assert.match(requoted.source, /<img src="b.jpg" loading="lazy">/);

  const bare = `<p>hi</p>`;
  assert.equal(setAttribute(bare, findEl(bare, byTag("p")), "id", "x").source, `<p id="x">hi</p>`);
  assert.throws(() => setAttribute(src, img, "alt", 'say "hi"'), EditError);
});

test("setText: replaces heading text; escapes HTML and Liquid delimiters by default", () => {
  const h2 = findEl(SAMPLE, (el) => byTag("h2")(el) && SAMPLE.slice(el.position.start, el.position.end).includes("Our services"));
  const r = setText(SAMPLE, textChild(h2), "What we do");
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  assert.ok(r.source.includes(`<h2 class="text-2xl">What we do</h2>`));

  const evil = setText(SAMPLE, textChild(h2), "<b>{{ x }}</b> & {% if %}");
  assertMinimalEdit(SAMPLE, evil.source, evil.touched);
  assert.ok(evil.source.includes(`&lt;b&gt;{{ '{{' }} x }}&lt;/b&gt; &amp; {{ '{%' }} if %}`));
});

test("setTagArgument: limit 6 → 4 is a one-byte splice", () => {
  const r = setTagArgument(SAMPLE, forTag(SAMPLE), "limit", "4");
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  assert.equal(r.touched[0]!.end - r.touched[0]!.start, 1);
  assert.ok(r.source.includes("{% for service in collections.services limit: 4 %}"));
  assert.throws(() => setTagArgument(SAMPLE, forTag(SAMPLE), "offset", "1"), EditError);
});

test("move: featured card into #service-grid, re-indented, source container left clean", () => {
  const card = findEl(SAMPLE, classHas("featured-card"));
  const grid = findEl(SAMPLE, withAttr("id", "service-grid"));
  const r = move(SAMPLE, card, { parent: grid, where: "append" });
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  const newGrid = findEl(r.source, withAttr("id", "service-grid"));
  const kids = (newGrid as Extract<ElementNode, { children: unknown }>).children.filter((c) => c.type !== NodeTypes.TextNode);
  assert.equal(kids.length, 2);
  assert.ok(r.source.includes(`      {% endfor %}\n      <article class="card featured-card">\n        <h3>Deck staining</h3>`));
  const featured = findEl(r.source, withAttr("id", "featured-grid"));
  assert.equal((featured as Extract<ElementNode, { children: unknown }>).children.filter((c) => c.type !== NodeTypes.TextNode).length, 0);
});

test("move: before / after a sibling, and into an empty element", () => {
  const src = `<ul>\n  <li>a</li>\n  <li>b</li>\n  <li>c</li>\n</ul>\n<div>\n</div>\n`;
  const lis = nodesOf(src).filter((n): n is ElementNode => n.type === NodeTypes.HtmlElement && n.name.length > 0 && src.startsWith("<li", n.position.start));
  const after = move(src, lis[0]!, { anchor: lis[1]!, where: "after" });
  assert.equal(after.source, `<ul>\n  <li>b</li>\n  <li>a</li>\n  <li>c</li>\n</ul>\n<div>\n</div>\n`);
  assertMinimalEdit(src, after.source, after.touched);
  const before = move(src, lis[2]!, { anchor: lis[0]!, where: "before" });
  assert.equal(before.source, `<ul>\n  <li>c</li>\n  <li>a</li>\n  <li>b</li>\n</ul>\n<div>\n</div>\n`);
  const into = move(src, lis[1]!, { parent: findEl(src, byTag("div")), where: "append" });
  assert.equal(into.source, `<ul>\n  <li>a</li>\n  <li>c</li>\n</ul>\n<div>\n  <li>b</li>\n</div>\n`);
  assert.throws(() => move(src, findEl(src, byTag("ul")), { anchor: lis[0]!, where: "after" }), EditError);
});

test("insert: new card into a for-loop branch, own line, branch indent", () => {
  const branch = forTag(SAMPLE).children[0]!;
  assert.equal(branch.type, NodeTypes.LiquidBranch);
  const r = insert(SAMPLE, `<article class="card">\n  <h3>New</h3>\n</article>`, { parent: branch as never, where: "prepend" });
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  assert.ok(r.source.includes(`limit: 6 %}\n        <article class="card">\n          <h3>New</h3>\n        </article>\n        <article class="card bg-base-200`));
  const inline = `<p><b>x</b></p>`;
  assert.equal(insert(inline, `<i>y</i>`, { anchor: findEl(inline, byTag("b")), where: "after" }).source, `<p><b>x</b><i>y</i></p>`);
});

test("wrap: hero button in {% if customer %}, indented one level", () => {
  const btn = findEl(SAMPLE, (el) => byTag("button")(el) && attrValue(el, "commandfor") === "quote-modal" && attrValue(el, "command") === "show-modal");
  const r = wrap(SAMPLE, btn, "{% if customer %}", "{% endif %}");
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  const wrapped = allNodes(parseSource(r.source)).map(([n]) => n).find((n) => isLiquidBlock(n) && n.name === "if" && r.source.slice(n.position.start).startsWith("{% if customer %}\n"));
  assert.ok(wrapped);
  assert.deepEqual(changedLines(SAMPLE, r.source), { removed: 3, added: 5 });
});

test("remove: deletes the textarea with its whole line", () => {
  const r = remove(SAMPLE, findEl(SAMPLE, byTag("textarea")));
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  assert.ok(!r.source.includes("<textarea"));
  assert.deepEqual(changedLines(SAMPLE, r.source), { removed: 1, added: 0 });
});

test("replace: any range with raw source", () => {
  const h1 = findEl(SAMPLE, byTag("h1"));
  const r = replace(SAMPLE, h1, `<h1 class="x">{{ page.title }}</h1>`);
  assertMinimalEdit(SAMPLE, r.source, r.touched);
  assert.ok(r.source.includes(`<h1 class="x">{{ page.title }}</h1>`));
});

test("six chained edits, reparsing between each, still parse strict", () => {
  let src = SAMPLE;
  const step = (fn: (s: string) => { source: string }) => {
    src = fn(src).source;
    parseSource(src, "strict");
  };
  step((s) => setAttribute(s, findEl(s, byTag("h1")), "class", "x"));
  step((s) => setText(s, textChild(findEl(s, (el) => byTag("h2")(el) && s.slice(el.position.start, el.position.end).includes("Our services"))), "What we do"));
  step((s) => setTagArgument(s, forTag(s), "limit", "4"));
  step((s) => move(s, findEl(s, classHas("featured-card")), { parent: findEl(s, withAttr("id", "service-grid")), where: "append" }));
  step((s) => wrap(s, findEl(s, (el) => byTag("button")(el) && attrValue(el, "command") === "show-modal"), "{% if customer %}", "{% endif %}"));
  step((s) => remove(s, findEl(s, byTag("textarea"))));
  assert.ok(src.includes("What we do") && src.includes("limit: 4") && !src.includes("<textarea"));
});
