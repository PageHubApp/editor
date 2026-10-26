import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, allNodes, isElement, isLiquidBlock, elementName, NodeTypes, buildTree, flattenTree, pathAtOffset, type TreeNode } from "../src/index.ts";
import { SAMPLE } from "./helpers.ts";

test("parse: element, block and output slices match the source exactly", () => {
  const nodes = allNodes(parseSource(SAMPLE)).map(([n]) => n);
  const elements = nodes.filter(isElement).filter((n) => n.type === NodeTypes.HtmlElement);
  assert.ok(elements.length > 40);
  for (const el of elements) {
    const slice = SAMPLE.slice(el.position.start, el.position.end);
    const name = elementName(el);
    assert.ok(slice.startsWith(`<${name}`), `starts <${name}`);
    assert.ok(slice.endsWith(`</${name}>`), `ends </${name}>`);
  }
  const blocks = nodes.filter(isLiquidBlock);
  assert.deepEqual([...new Set(blocks.map((b) => b.name))].sort(), ["for", "form", "if", "paginate"]);
  for (const b of blocks) {
    const slice = SAMPLE.slice(b.position.start, b.position.end);
    assert.match(slice, /^\{%-?\s*\w+/);
    assert.match(slice, new RegExp(`\\{%-?\\s*end${b.name}\\s*-?%\\}$`));
  }
  for (const out of nodes.filter((n) => n.type === NodeTypes.LiquidVariableOutput)) {
    assert.match(SAMPLE.slice(out.position.start, out.position.end), /^\{\{[\s\S]*\}\}$/);
  }
});

test("parse: top-level ranges plus the gaps between them rebuild the file", () => {
  const ast = parseSource(SAMPLE);
  let cur = 0;
  let rebuilt = "";
  for (const c of ast.children) {
    rebuilt += SAMPLE.slice(cur, c.position.start) + SAMPLE.slice(c.position.start, c.position.end);
    cur = c.position.end;
  }
  assert.equal(rebuilt + SAMPLE.slice(cur), SAMPLE);
});

test("parse: for-loop markup is typed down to the limit argument's own range", () => {
  const forTag = allNodes(parseSource(SAMPLE)).map(([n]) => n).find((n) => isLiquidBlock(n) && n.name === "for")!;
  const markup = (forTag as unknown as { markup: { variableName: string; args: Array<{ name: string; value: { value: string; position: { start: number; end: number } } }> } }).markup;
  assert.equal(markup.variableName, "service");
  const limit = markup.args.find((a) => a.name === "limit")!;
  assert.equal(limit.value.value, "6"); // number literals are strings
  assert.equal(SAMPLE.slice(limit.value.position.start, limit.value.position.end), "6");
});

test("parse: strict mode throws on unclosed HTML", () => {
  assert.throws(() => parseSource("<div><p>x</div>"), /before HtmlElement 'p' was closed/);
});

const show = (n: TreeNode): string =>
  n.kind === "element" ? `<${n.tag}>` : n.kind === "liquid-block" ? `{% ${n.tag} %}` : n.type;

test("tree: elements and blocks nest; branches become slots for both block shapes", () => {
  const tree = buildTree(parseSource(SAMPLE));
  const all = flattenTree(tree);
  const forBlock = all.find((n) => n.kind === "liquid-block" && n.tag === "for");
  assert.ok(forBlock && forBlock.kind === "liquid-block");
  assert.deepEqual(forBlock.branches.map((b) => b.name), ["main", "else"]);
  assert.equal(show(forBlock.branches[0]!.children[0]!), "<article>");
  assert.equal(show(forBlock.branches[1]!.children[0]!), "<p>");

  const paginate = all.find((n) => n.kind === "liquid-block" && n.tag === "paginate");
  assert.ok(paginate && paginate.kind === "liquid-block");
  assert.deepEqual(paginate.branches.map((b) => b.name), ["body"]);
  assert.deepEqual(paginate.branches[0]!.children.map(show), ["<ul>", "{% if %}"]);

  const form = all.find((n) => n.kind === "liquid-block" && n.tag === "form");
  assert.ok(form && form.kind === "liquid-block");
  assert.equal(form.branches[0]!.children.filter((c) => c.kind === "element").length, 6);
});

test("tree: every node sits inside its parent; siblings are ordered and disjoint", () => {
  const check = (nodes: TreeNode[], parent: { start: number; end: number }) => {
    let prev = parent.start;
    for (const n of nodes) {
      assert.ok(n.range.start >= prev && n.range.end <= parent.end, `${show(n)} inside parent and after previous`);
      prev = n.range.end;
      if (n.kind === "element") check(n.children, n.range);
      if (n.kind === "liquid-block") for (const b of n.branches) check(b.children, b.range);
    }
  };
  check(buildTree(parseSource(SAMPLE)), { start: 0, end: SAMPLE.length });
});

test("tree: an offset resolves to the innermost node (canvas click → source)", () => {
  const tree = buildTree(parseSource(SAMPLE));
  const at = SAMPLE.indexOf("{{ service.title }}</h3>");
  const path = pathAtOffset(tree, at).map(show);
  assert.deepEqual(path.slice(path.indexOf("{% for %}")), ["{% for %}", "<article>", "<div>", "<h3>", "LiquidVariableOutput"]);
  assert.deepEqual(path.slice(0, 3), ["<main>", "<section>", "<div>"]);
  assert.deepEqual(pathAtOffset(tree, SAMPLE.length + 5), []);
});
