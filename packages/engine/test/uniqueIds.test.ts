import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestEditor } from "../src/testing/index.ts";
import { htmlKit } from "../src/kits/html/htmlKit.ts";

const P = "p.html";
const ed = (src = "<main>\n</main>\n") => createTestEditor({ files: { [P]: src }, extensions: [htmlKit()] });

const MODAL = `<section>
  <button commandfor="blk_2" command="show-modal" aria-controls="blk_2">Open</button>
  <dialog id="blk_2" aria-labelledby="blk_2-title"><h2 id="blk_2-title">Hi</h2><button commandfor="blk_2" command="close">x</button></dialog>
</section>`;

const FORM = `<section>
  <form>
    <label for="ph-input-blk_4">Email</label>
    <input id="ph-input-blk_4" name="email" aria-describedby="hint-1">
    <p id="hint-1">We never share it</p>
  </form>
</section>`;

const TABS = `<section>
  <button data-tab-target="pane-a" data-tab-of="tabs">A</button>
  <button data-tab-target="pane-b" data-tab-of="tabs">B</button>
  <div id="pane-a" data-tab-group="tabs">a</div>
  <div id="pane-b" data-tab-group="tabs" class="hidden">b</div>
  <a href="#pane-b">jump</a>
</section>`;

const ids = (html: string) => [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);

test("the first insert is verbatim; the second copy gets fresh ids", () => {
  const e = ed();
  e.select(e.get("main"));
  assert.ok(e.run("element.insert", { snippet: FORM }));
  assert.ok(e.text().includes('id="ph-input-blk_4"'));
  assert.ok(!e.text().includes("-2"), "nothing renamed on the first insert");
  e.select(e.get("main"));
  assert.ok(e.run("element.insert", { snippet: FORM }));
  const all = ids(e.text());
  assert.equal(all.length, new Set(all).size, `ids are unique: ${all.join(", ")}`);
  assert.ok(all.includes("ph-input-blk_4-2") && all.includes("hint-1-2"));
});

test("internal references follow their renamed id (label for, aria-describedby)", () => {
  const e = ed();
  for (let i = 0; i < 2; i++) {
    e.select(e.get("main"));
    assert.ok(e.run("element.insert", { snippet: FORM }));
  }
  const text = e.text();
  assert.match(text, /<label for="ph-input-blk_4-2">/);
  assert.match(text, /<input id="ph-input-blk_4-2" name="email" aria-describedby="hint-1-2">/);
  assert.match(text, /<label for="ph-input-blk_4">/);
});

test("a modal trigger in the second copy points at the second dialog", () => {
  const e = ed();
  for (let i = 0; i < 3; i++) {
    e.select(e.get("main"));
    assert.ok(e.run("element.insert", { snippet: MODAL }));
  }
  const text = e.text();
  const dialogs = [...text.matchAll(/<dialog id="([^"]+)" aria-labelledby="([^"]+)"><h2 id="([^"]+)"/g)];
  assert.equal(dialogs.length, 3);
  assert.deepEqual(dialogs.map((d) => d[1]), ["blk_2", "blk_2-2", "blk_2-3"]);
  for (const [, id, labelled, title] of dialogs) {
    assert.equal(labelled, title, "the heading labels its own dialog");
    // every trigger of this copy (open + close) names this dialog and no other
    assert.ok(text.includes(`<button commandfor="${id}" command="show-modal" aria-controls="${id}">`));
    assert.ok(text.includes(`<button commandfor="${id}" command="close">`));
  }
  const all = ids(text);
  assert.equal(all.length, new Set(all).size);
});

test("tab groups, show/hide targets and #anchors are renamed together", () => {
  const e = ed(`<main>\n  <div id="pane-a" data-tab-group="tabs">existing</div>\n</main>\n`);
  e.select(e.get("main"));
  assert.ok(e.run("element.insert", { snippet: TABS }));
  const text = e.text();
  assert.match(text, /data-tab-target="pane-a-2" data-tab-of="tabs-2"/);
  assert.match(text, /data-tab-target="pane-b" data-tab-of="tabs-2"/, "pane-b was free, so it keeps its id; the group still moves");
  assert.match(text, /<div id="pane-a-2" data-tab-group="tabs-2">/);
  assert.match(text, /<a href="#pane-b">/);
  assert.match(text, /<div id="pane-a" data-tab-group="tabs">existing/, "the page's own ids are never touched");
});

test("ids with Liquid in them are dynamic and left as written", () => {
  const e = ed();
  const snippet = `<ul>{% for i in (1..2) %}<li id="item-{{ i }}"><a href="#item-{{ i }}">x</a></li>{% endfor %}</ul>`;
  for (let i = 0; i < 2; i++) {
    e.select(e.get("main"));
    assert.ok(e.run("element.insert", { snippet }));
  }
  assert.ok(!e.text().includes("item-{{ i }}-2"));
});

test("an id the page already has is renamed in the snippet only", () => {
  const e = ed(`<main>\n  <section id="s"><div id="blk_2">x</div></section>\n</main>\n`);
  e.select(e.get("main"));
  assert.ok(e.run("element.insert", { snippet: '<section><div id="blk_2">y</div></section>' }));
  const all = ids(e.text());
  assert.equal(all.length, new Set(all).size);
});

test("a renamed insert is still one undo step", () => {
  const e = ed(`<main>\n  <div id="blk_2">x</div>\n</main>\n`);
  const before = e.state.files.get(P);
  e.select(e.get("main"));
  assert.ok(e.run("element.insert", { snippet: '<div id="blk_2">y</div>' }));
  assert.ok(e.text().includes('id="blk_2-2"'));
  assert.ok(e.undo());
  assert.equal(e.state.files.get(P), before);
});

const CHAT = `<div class="contents" data-chat-bubble="true" hidden="hidden">
  <div id="agent-bubble-blk_1" popover="manual">
    <div id="agent-chat-blk_2" data-chat="true" hidden="hidden">
      <span data-variable="state.agent-chat-blk_2:assistantName" class="variable-node" data-state-text="agent-chat-blk_2:assistantName"></span>
      <button commandfor="agent-bubble-blk_1" command="hide-popover" type="button">x</button>
      <div data-state-show="agent-chat-blk_2:hasError"><span data-state-text="agent-chat-blk_2:error"></span></div>
      <div data-state-show="!agent-chat-blk_2:ended && agent-chat-blk_2:available"><textarea id="ph-input-blk_3" name="agentMessage"></textarea><button data-chat-send="agentMessage" type="button">s</button></div>
    </div>
  </div>
  <button commandfor="agent-bubble-blk_1" command="show-popover" type="button">open</button>
</div>`;

test("a second chat block renames the state keys derived from its renamed ids, and only its own", () => {
  const e = ed();
  for (let i = 0; i < 2; i++) {
    e.select(e.get("main"));
    assert.ok(e.run("element.insert", { snippet: CHAT }));
  }
  const text = e.text();
  const parts = text.split('<div class="contents"').filter(Boolean);
  const first = parts.find((p) => p.includes('id="agent-chat-blk_2"'))!;
  const second = parts.find((p) => p.includes('id="agent-chat-blk_2-2"'))!;
  assert.ok(first && second, text);
  assert.ok(first.includes('id="agent-chat-blk_2"') && first.includes('data-state-show="agent-chat-blk_2:hasError"'), "the first copy is verbatim");
  assert.ok(!/blk_2-2|blk_1-2/.test(first), "the first copy never mentions the second's names");
  assert.ok(second.includes('id="agent-chat-blk_2-2"') && second.includes('id="agent-bubble-blk_1-2"'));
  assert.ok(second.includes('data-state-show="agent-chat-blk_2-2:hasError"'));
  assert.ok(second.includes('data-state-show="!agent-chat-blk_2-2:ended && agent-chat-blk_2-2:available"'));
  assert.ok(second.includes('data-state-text="agent-chat-blk_2-2:assistantName"') && second.includes('data-variable="state.agent-chat-blk_2-2:assistantName"'));
  assert.ok(second.includes('commandfor="agent-bubble-blk_1-2" command="show-popover"'));
  // every state key in the second copy belongs to its own widget
  const keys = [...second.matchAll(/agent-chat-blk_2(?:-\d+)?(?=:)/g)].map((m) => m[0]);
  assert.ok(keys.length >= 6 && keys.every((k) => k === "agent-chat-blk_2-2"), keys.join(", "));
  const all = ids(text);
  assert.equal(all.length, new Set(all).size);
});

test("a state-key prefix that is not a renamed id is left alone", () => {
  const e = ed(`<main>\n  <div id="x">a</div>\n</main>\n`);
  e.select(e.get("main"));
  assert.ok(e.run("element.insert", { snippet: '<div id="x" data-state-show="x:on && xy:on && other:x"><p id="xy">b</p></div>' }));
  assert.ok(e.text().includes('data-state-show="x-2:on && xy:on && other:x"'));
});
