import { fire, resetDom, tick } from "../setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import * as chat from "../../src/chunks/chat.ts";
import * as on from "../../src/chunks/on.ts";
import { hub } from "../../src/hub.ts";
import { get, test as cond } from "../../src/state-store.ts";
import { cfg, motion, q } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("on", () => {
  let warn: ReturnType<typeof mock.method>;
  beforeEach(() => { warn = mock.method(console, "warn", () => {}); });
  afterEach(() => warn.mock.restore());
  it("calls a registered function with (event, el); .once fires one time", () => {
    resetDom('<button data-on="click:go.once; mouseenter:hover"></button>');
    const go = mock.fn();
    const hover = mock.fn();
    hub(window).on("go", go);
    hub(window).on("hover", hover);
    on.mount(q("button"));
    fire(q("button"), "click");
    fire(q("button"), "click");
    fire(q("button"), "mouseenter");
    assert.equal(go.mock.callCount(), 1);
    assert.equal(go.mock.calls[0]!.arguments[1], q("button"));
    assert.equal(hover.mock.callCount(), 1);
  });
  it("unknown function is a console warning, not a throw; .prevent cancels the default", () => {
    resetDom('<a data-on="click:nope.prevent">x</a>');
    on.mount(q("a"));
    const e = new Event("click", { cancelable: true, bubbles: true });
    q("a").dispatchEvent(e);
    assert.ok(e.defaultPrevented);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0]!.arguments[0]), /nope/);
  });
  it("a function registered after mount still runs", () => {
    resetDom('<b data-on="click:late"></b>');
    on.mount(q("b"));
    const late = mock.fn();
    hub(window).on("late", late);
    fire(q("b"), "click");
    assert.equal(late.mock.callCount(), 1);
  });
});

describe("chat-send", () => {
  it("sends the named field and clears it; falls back to the button text", () => {
    resetDom('<form><input name=q><button type=button data-chat-send="q">Hello bot</button></form>');
    const seen: any[] = [];
    document.addEventListener("site:chat", (e) => seen.push((e as CustomEvent).detail), { once: false });
    chat.mount(q("button"));
    (q("input") as HTMLInputElement).value = " pricing? ";
    fire(q("button"), "click");
    assert.deepEqual(seen.at(-1), { text: "pricing?", open: true });
    assert.equal((q("input") as HTMLInputElement).value, "");
    fire(q("button"), "click");
    assert.equal(seen.at(-1).text, "Hello bot");
  });
  it("on a form it sends on submit and ignores an empty field", () => {
    resetDom('<form data-chat-send="msg"><input name=msg></form>');
    const seen: any[] = [];
    const h = (e: Event) => seen.push((e as CustomEvent).detail);
    document.addEventListener("site:chat", h);
    chat.mount(q("form"));
    fire(q("form"), "submit");
    assert.equal(seen.length, 0);
    (q("input") as HTMLInputElement).value = "hi";
    fire(q("form"), "submit");
    document.removeEventListener("site:chat", h);
    assert.equal(seen[0].text, "hi");
  });
});

describe("chat widget", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => (globalThis.fetch = realFetch));

  /** An SSE body that delivers each frame as its own chunk. */
  const sse = (frames: unknown[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const f of frames) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(f)}\n\n`));
        c.close();
      },
    });
  const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, body: null }) as any;
  const stream = (frames: unknown[]) => ({ ok: true, status: 200, body: sse(frames) }) as any;

  const html = (id: string) =>
    `<div data-ph-bubble data-chat-bubble hidden><div data-chat id="${id}" hidden>
       <div data-chat-turns>
         <template data-chat-role="user"><div class="u"><span data-turn-text></span></div></template>
         <template data-chat-role="assistant"><div class="a"><span data-turn-text></span></div></template>
       </div>
       <textarea name="agentMessage"></textarea><button data-chat-send="agentMessage"></button>
     </div></div>`;
  const history = { available: true, ended: false, branding: { assistantName: "Moss", greeting: "Hi there", accentColor: null }, turns: [] };

  /** Mounts the widget with a fake backend: `/history` answers `hist`, `/message` replays `reply` (or fails with `fail`). */
  async function boot(id: string, hist: unknown, reply: () => any = () => stream([])) {
    const calls: { url: string; body?: any }[] = [];
    globalThis.fetch = (async (url: string, init?: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      return url.endsWith("/history") ? json(hist) : reply();
    }) as any;
    resetDom(html(id));
    const config = { ...cfg, chat: { event: "site:chat", api: "/api/site-chat/s1" } };
    chat.mount(q("[data-chat]"), config);
    chat.mount(q("[data-chat-send]"), config);
    await tick(5);
    return calls;
  }
  const rows = () => [...document.querySelectorAll("[data-chat-turns] > :not(template)")].map((r) => `${r.className}:${r.textContent}`);
  const typeAndSend = async (text: string) => {
    (q("textarea") as HTMLTextAreaElement).value = text;
    fire(q("[data-chat-send]"), "click");
    await tick(10);
  };

  it("un-hides the panel and its bubble when /history says chat is on, and shows the greeting", async () => {
    await boot("chat-a", history);
    assert.equal(q("[data-chat]").hidden, false);
    assert.equal(q("[data-chat-bubble]").hidden, false);
    assert.equal(get("chat-a:available"), "on");
    assert.equal(get("chat-a:assistantName"), "Moss");
    assert.equal(get("chat-a:rehydrating"), "");
    assert.deepEqual(rows(), ["a:Hi there"]);
  });

  it("stays hidden, with available off, when chat is unavailable", async () => {
    await boot("chat-b", { available: false });
    assert.equal(q("[data-chat]").hidden, true);
    assert.equal(q("[data-chat-bubble]").hidden, true);
    assert.equal(cond("chat-b:available"), false);
  });

  it("stays hidden with no chat.api in the config", async () => {
    resetDom(html("chat-c"));
    chat.mount(q("[data-chat]"), cfg);
    await tick(5);
    assert.equal(q("[data-chat]").hidden, true);
  });

  it("restores the stored turns and the ended flag from /history", async () => {
    await boot("chat-d", { ...history, ended: true, turns: [{ id: "1", role: "user", content: "hello" }, { id: "2", role: "assistant", content: "Thanks, we are closed." }] });
    assert.deepEqual(rows(), ["u:hello", "a:Thanks, we are closed."]);
    assert.equal(cond("chat-d:ended"), true);
    assert.equal((q("textarea") as HTMLTextAreaElement).disabled, true);
  });

  it("sends the composer text to /message with the page path and renders the streamed reply", async () => {
    const calls = await boot("chat-e", history, () => stream([{ type: "meta", assistantName: "Moss" }, { type: "text_delta", text: "We open " }, { type: "text_delta", text: "at nine." }, { type: "done" }]));
    await typeAndSend("  when do you open?  ");
    const post = calls.find((c) => c.url.endsWith("/message"))!;
    assert.equal(post.url, "/api/site-chat/s1/message");
    assert.deepEqual(post.body, { content: "when do you open?", pagePath: "/" });
    assert.deepEqual(rows(), ["u:when do you open?", "a:We open at nine."]);
    assert.equal((q("textarea") as HTMLTextAreaElement).value, "");
    assert.equal(cond("chat-e:sending"), false);
    assert.equal(cond("chat-e:hasError"), false);
    assert.equal(cond("chat-e:hasTurns"), true);
  });

  it("shows the streaming bubble and sending flag while the reply arrives", async () => {
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "text_delta", text: "Part" })}\n\n`));
        await new Promise<void>((r) => (finish = r));
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        c.close();
      },
    });
    await boot("chat-f", history, () => ({ ok: true, status: 200, body }));
    await typeAndSend("hi");
    assert.equal(cond("chat-f:sending"), true);
    assert.equal(get("chat-f:streamingText"), "Part");
    assert.deepEqual(rows(), ["u:hi", "a:Part"]);
    assert.equal((q("[data-chat-send]") as HTMLButtonElement).disabled, true);
    finish();
    await tick(10);
    assert.equal(cond("chat-f:sending"), false);
    assert.deepEqual(rows(), ["u:hi", "a:Part"]);
    assert.equal((q("[data-chat-send]") as HTMLButtonElement).disabled, false);
  });

  it("a failed request sets hasError and the message", async () => {
    await boot("chat-g", history, () => ({ ok: false, status: 500, body: null }) as any);
    await typeAndSend("hi");
    assert.equal(cond("chat-g:hasError"), true);
    assert.match(get("chat-g:error")!, /didn't send/);
    assert.equal(cond("chat-g:sending"), false);
  });

  it("a 429 says to wait, and a stream error event says the assistant could not answer", async () => {
    await boot("chat-h", history, () => ({ ok: false, status: 429, body: null }) as any);
    await typeAndSend("hi");
    assert.match(get("chat-h:error")!, /Wait a minute/);
    await boot("chat-i", history, () => stream([{ type: "error", code: "x", message: "m" }, { type: "done" }]));
    await typeAndSend("hi");
    assert.equal(cond("chat-i:hasError"), true);
    assert.match(get("chat-i:error")!, /couldn't answer/);
  });

  it("an ended event adds the closing note as the last turn and ends the chat", async () => {
    await boot("chat-j", history, () => stream([{ type: "meta", assistantName: "Moss" }, { type: "ended", text: "Thanks! Email us at hi@x.test." }, { type: "done" }]));
    await typeAndSend("hi");
    assert.deepEqual(rows(), ["u:hi", "a:Thanks! Email us at hi@x.test."]);
    assert.equal(cond("chat-j:ended"), true);
    assert.equal((q("textarea") as HTMLTextAreaElement).disabled, true);
    const before = rows().length;
    await typeAndSend("again");
    assert.equal(rows().length, before);
  });

  it("Enter sends and Shift+Enter does not", async () => {
    const calls = await boot("chat-k", history, () => stream([{ type: "done" }]));
    (q("textarea") as HTMLTextAreaElement).value = "enter";
    const key = (init: KeyboardEventInit) => q("textarea").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    key({ key: "Enter", shiftKey: true });
    await tick(5);
    assert.equal(calls.filter((c) => c.url.endsWith("/message")).length, 0);
    key({ key: "Enter" });
    await tick(10);
    assert.equal(calls.filter((c) => c.url.endsWith("/message")).length, 1);
  });

  it("a page-level chat-send (no widget around it) reaches the first widget", async () => {
    const calls = await boot("chat-l", history, () => stream([{ type: "done" }]));
    document.dispatchEvent(new CustomEvent("site:chat", { detail: { text: "from a CTA", open: true } }));
    await tick(10);
    assert.deepEqual(calls.find((c) => c.url.endsWith("/message"))?.body?.content, "from a CTA");
  });

  it("nothing is sent before chat is available", async () => {
    const calls = await boot("chat-m", { available: false });
    document.dispatchEvent(new CustomEvent("site:chat", { detail: { text: "hi" } }));
    await tick(5);
    assert.equal(calls.filter((c) => c.url.endsWith("/message")).length, 0);
  });

  it("in the editing canvas the shell is shown with no history request, so it can be edited", async () => {
    document.documentElement.setAttribute("data-ph-edit", "");
    try {
      const calls = await boot("chat-edit", { available: false });
      assert.equal(q("[data-chat]").hidden, false);
      assert.equal(q("[data-chat-bubble]").hidden, false);
      assert.equal(calls.length, 0);
    } finally {
      document.documentElement.removeAttribute("data-ph-edit");
    }
  });

  it("two widgets on a page keep their own state: each reads and writes only its own id's keys", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      return json(history);
    }) as any;
    resetDom(html("chat-one") + html("chat-two"));
    const config = { ...cfg, chat: { event: "site:chat", api: "/api/site-chat/s1" } };
    for (const el of document.querySelectorAll("[data-chat]")) chat.mount(el, config);
    await tick(5);
    assert.equal(get("chat-one:available"), "on");
    assert.equal(get("chat-two:available"), "on");
    // a send from inside the second widget goes to the second widget only
    const second = document.querySelectorAll("[data-chat]")[1]!;
    (second.querySelector("textarea") as HTMLTextAreaElement).value = "to two";
    chat.mount(second.querySelector("[data-chat-send]")!, config);
    fire(second.querySelector("[data-chat-send]")!, "click");
    await tick(10);
    const turnsIn = (el: Element) => [...el.querySelectorAll("[data-chat-turns] > :not(template)")].map((r) => r.textContent);
    assert.ok(turnsIn(second).includes("to two"));
    assert.ok(!turnsIn(document.querySelectorAll("[data-chat]")[0]!).includes("to two"));
  });
});
