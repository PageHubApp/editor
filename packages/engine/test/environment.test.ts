import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, createParserEnvironment, buildTree, lint, NodeTypes } from "../src/index.ts";

const MAP = `{% map lat: 34.1, lng: -118.3, zoom: 14 %}\n  <div class="pin">Shop</div>\n{% endmap %}`;

test("environment: an unregistered block tag parses flat — the trap this module exists for", () => {
  const ast = parseSource(MAP);
  assert.deepEqual(ast.children.map((n) => n.type), [NodeTypes.LiquidTag, NodeTypes.HtmlElement, NodeTypes.LiquidTag]);
});

test("environment: a block tag registered like `form` parses with children and typed arguments", () => {
  const env = createParserEnvironment([{ name: "map", parseLike: "form" }]);
  const ast = parseSource(MAP, "strict", { env });
  assert.equal(ast.children.length, 1);
  const map = ast.children[0] as unknown as { name: string; children: Array<{ type: string }>; markup: Array<{ type: string; name: string }> };
  assert.equal(map.name, "map");
  assert.deepEqual(map.children.filter((c) => c.type === NodeTypes.HtmlElement).length, 1);
  assert.deepEqual(map.markup.map((a) => a.name), ["lat", "lng", "zoom"]);
  const tree = buildTree(ast);
  assert.equal(tree[0]!.kind, "liquid-block");
  assert.deepEqual(lint(MAP, { env }), []);
});

test("environment: each environment is isolated and keeps Shopify's built-ins", () => {
  createParserEnvironment([{ name: "map", parseLike: "form" }]);
  const plain = createParserEnvironment();
  assert.equal(parseSource(MAP, "strict", { env: plain }).children.length, 3);
  const form = parseSource(`{% form 'leads' %}<input name="a">{% endform %}`, "strict", { env: plain });
  assert.equal(form.children.length, 1);
});

test("environment: unknown parseLike throws", () => {
  assert.throws(() => createParserEnvironment([{ name: "x", parseLike: "nope" as never }]), /no built-in definition/);
});
