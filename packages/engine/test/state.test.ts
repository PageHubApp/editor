import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.ts";
import { StateEffect, StateField, effectsOf } from "../src/state/state.ts";
import { history } from "../src/history/history.ts";
import { insert, move, remove, replace, setAttribute, setText, wrap, setTagArgument } from "../src/edit/ops.ts";
import { parseSource, isLiquidBlock, NodeTypes, type LiquidBlockNode, type ElementNode } from "../src/index.ts";
import { SAMPLE, findEl, byTag, withAttr, nodesOf } from "./helpers.ts";

const P = "pages/index.liquid";
const open = (extra: unknown[] = []) => createStore({ files: { [P]: SAMPLE }, extensions: [history(), ...(extra as never[])] });
const text = (s: ReturnType<typeof open>) => s.state.files.get(P)!;

test("builder: verbs produce the same text as the edit ops", () => {
  const h1 = findEl(SAMPLE, byTag("h1"));
  const hero = findEl(SAMPLE, withAttr("data-section", "hero"));
  const grid = findEl(SAMPLE, withAttr("id", "featured-grid"));
  const forTag = nodesOf(SAMPLE).find((n): n is LiquidBlockNode => isLiquidBlock(n) && n.name === "for")!;
  const h1Text = (h1 as Extract<ElementNode, { children: unknown }>).children.find((c) => c.type === NodeTypes.TextNode)!;
  const cases: Array<[string, (s: ReturnType<typeof open>) => void, string]> = [
    ["insert", (s) => s.dispatch((tr) => tr.insert({ after: s.find(P, "section.hero")[0]! }, "<p>new</p>")), insert(SAMPLE, "<p>new</p>", { anchor: hero, where: "after" }).source],
    ["move", (s) => s.dispatch((tr) => tr.move(s.find(P, "h1")[0]!, { append: s.find(P, "#featured-grid")[0]! })), move(SAMPLE, h1, { parent: grid, where: "append" }).source],
    ["remove", (s) => s.dispatch((tr) => tr.remove(s.find(P, "[data-section=hero]")[0]!)), remove(SAMPLE, hero).source],
    ["setAttr", (s) => s.dispatch((tr) => tr.setAttr(s.find(P, "h1")[0]!, "class", "x")), setAttribute(SAMPLE, h1, "class", "x").source],
    ["setText", (s) => s.dispatch((tr) => tr.setText(s.find(P, "h1")[0]!.children()[0]!, "A & B")), setText(SAMPLE, h1Text, "A & B").source],
    ["replace", (s) => s.dispatch((tr) => tr.replace(s.find(P, "h1")[0]!, "<h1>Hi</h1>")), replace(SAMPLE, h1, "<h1>Hi</h1>").source],
    ["wrap", (s) => s.dispatch((tr) => tr.wrap(s.find(P, "section.hero")[0]!, "{% if a %}", "{% endif %}")), wrap(SAMPLE, hero, "{% if a %}", "{% endif %}").source],
    ["setTagArg", (s) => s.dispatch((tr) => tr.setTagArg(s.find(P, "%for")[0]!, "limit", "4")), setTagArgument(SAMPLE, forTag as never, "limit", "4").source],
  ];
  for (const [name, run, expected] of cases) {
    const s = open();
    run(s);
    assert.equal(text(s), expected, name);
  }
});

test("builder: several verbs in one transaction compose; handles resolve in the edited text", () => {
  const s = open();
  const h1 = s.find(P, "h1")[0]!;
  const footer = s.find(P, "footer")[0]!;
  s.dispatch((tr) => tr.insert({ before: s.find(P, "main")[0]! }, "<header>top</header>").setAttr(h1, "class", "big").remove(footer));
  assert.match(text(s), /<header>top<\/header>\n<main/);
  assert.match(text(s), /<h1 class="big">/);
  assert.doesNotMatch(text(s), /<footer/);
  assert.equal(h1.attr("class"), "big");
  assert.equal(footer.alive, false);
  parseSource(text(s));
});

test("state: effects update fields without touching files; origin is preserved", () => {
  const bump = StateEffect.define<number>();
  const zoom = StateField.define({ create: () => 1, update: (v: number, tr) => effectsOf(tr, bump).reduce((a, b) => a + b, v) });
  let origin: string | undefined;
  const spy = StateField.define({ create: () => null, update: (_: null, tr) => ((origin = tr.annotations.origin), null) });
  const s = createStore({ files: { [P]: SAMPLE }, extensions: [zoom, spy] });
  const files = s.state.files;
  s.dispatch((tr) => tr.effect(bump, 2).annotate({ origin: "ai" }));
  assert.equal(s.state.field(zoom), 3);
  assert.equal(s.state.files, files, "files map untouched");
  assert.equal(origin, "ai");
  s.dispatch((tr) => tr.setAttr(s.find(P, "h1")[0]!, "id", "t").annotate({ origin: "remote" }));
  assert.equal(origin, "remote");
});

test("state: tree(path) is memoized per text and shared with the next state when unchanged", () => {
  const s = createStore({ files: { [P]: SAMPLE, "b.liquid": "<p>b</p>" } });
  const tree = s.state.tree(P);
  assert.equal(s.state.tree(P), tree);
  s.dispatch((tr) => tr.setAttr(s.find("b.liquid", "p")[0]!, "id", "x"));
  assert.equal(s.state.tree(P), tree);
});

test("dispatch: from a listener throws in dev, is queued in prod", () => {
  const dev = createStore({ files: { [P]: SAMPLE }, dev: true });
  dev.subscribe((st) => st.files, () => dev.dispatch((tr) => tr.setAttr(dev.find(P, "h2")[0]!, "id", "x")));
  assert.throws(() => dev.dispatch((tr) => tr.setAttr(dev.find(P, "h1")[0]!, "id", "a")), /from a state listener/);

  const prod = createStore({ files: { [P]: SAMPLE }, dev: false });
  let once = false;
  prod.subscribe((st) => st.files, () => {
    if (once) return;
    once = true;
    prod.dispatch((tr) => tr.setAttr(prod.find(P, "h2")[0]!, "id", "x"));
  });
  prod.dispatch((tr) => tr.setAttr(prod.find(P, "h1")[0]!, "id", "a"));
  assert.match(text(prod as never), /<h2 class="text-2xl" id="x">/);
  assert.match(text(prod as never), /<h1 class="[^"]*" id="a">/);
});

test("handles: survive an insert above, a move of their own node, and an undo", () => {
  const s = open();
  const h3 = s.find(P, "h3")[1]!; // "Deck staining"
  const title = h3.children()[0]!;
  assert.equal(title.text(), "Deck staining");
  s.dispatch((tr) => tr.insert({ before: s.find(P, "main")[0]! }, "<header>\n  <p>top</p>\n</header>"));
  assert.ok(h3.alive);
  assert.equal(h3.text(), "<h3>Deck staining</h3>");
  // move the h3's article to the hero container: the handle and its child follow
  const article = s.find(P, "article.featured-card")[0]!;
  s.dispatch((tr) => tr.move(article, { append: s.find(P, "section.hero > div")[0]! }));
  assert.ok(article.alive && h3.alive && title.alive);
  assert.equal(h3.parent(), article);
  assert.equal(article.parent()!.attr("class"), "max-w-page mx-auto");
  assert.equal(title.text(), "Deck staining");
  s.dispatch((tr) => tr.setAttr(h3, "class", "x").annotate({ time: Date.now() + 1000 }));
  assert.equal(h3.attr("class"), "x");
  // undo the attribute, then the move: the handle goes back with its node
  assert.ok(s.undo());
  assert.ok(s.undo());
  assert.ok(article.alive && h3.alive, "handles survive undoing the move");
  assert.equal(article.parent()!.attr("id"), "featured-grid");
  assert.ok(s.undo());
  assert.equal(text(s), SAMPLE);
  assert.equal(h3.text(), "<h3>Deck staining</h3>");
  assert.equal(s.handle(P, h3.range.from + 2), h3);
});

test("handles: a removed node's handle is dead; shared per node", () => {
  const s = open();
  const footer = s.find(P, "footer")[0]!;
  assert.equal(s.find(P, "footer")[0], footer, "same node, same handle");
  const li = s.find(P, "footer li")[0]!;
  s.dispatch((tr) => tr.remove(footer));
  assert.equal(footer.alive, false);
  assert.equal(li.alive, false);
  assert.throws(() => footer.attr("class"), /dead/);
  assert.throws(() => s.dispatch((tr) => tr.remove(footer)), /dead/);
});

test("handles: session identity has null ids and writes no data-edit- attribute", () => {
  const s = open();
  const h1 = s.find(P, "h1")[0]!;
  assert.equal(h1.id(), null);
  s.dispatch((tr) => tr.insert({ after: h1 }, "<p>x</p>").setAttr(h1, "class", "y").wrap(s.find(P, "footer")[0]!, "{% if a %}", "{% endif %}"));
  s.dispatch((tr) => tr.move(s.find(P, "h2")[0]!, { prepend: s.find(P, "main")[0]! }));
  assert.ok(!text(s).includes("data-edit-"));
  assert.equal(h1.kind, "element");
  assert.equal(s.find(P, "%for")[0]!.kind, "liquid-block");
  assert.equal(s.find(P, "%render")[0]!.kind, "liquid-tag");
  assert.deepEqual(s.find(P, "%render")[0]!.args().map((a) => a.name), ["site"]);
});
