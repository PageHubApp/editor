import { fire, resetDom, tick } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import * as carousel from "../../src/chunks/carousel.ts";
import * as chat from "../../src/chunks/chat.ts";
import * as on from "../../src/chunks/on.ts";
import * as overflow from "../../src/chunks/overflow.ts";
import * as state from "../../src/chunks/state.ts";
import * as stateCompute from "../../src/chunks/state-compute.ts";
import * as stateView from "../../src/chunks/state-view.ts";
import { CHUNK_SELECTORS, setChunkLoader, type ChunkModule } from "../../src/chunks.ts";
import { start } from "../../src/core.ts";
import { get, set, subscribe, test as cond } from "../../src/state-store.ts";
import { FakeIO, K, cfg, motion, mountAll, q, useIO, w } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("loader table", () => {
  const cases: [string, string][] = [
    ['<p data-fit-text="oneline">x</p>', "fit-text"],
    ['<section data-scroll-effect="horizontal"></section>', "scroll-effect"],
    ["<div data-drag-scroll></div>", "overflow"],
    ['<div data-scrollbar-autohide="1s"></div>', "overflow"],
    ['<div data-carousel="dots"></div>', "carousel"],
    ['<button data-state-set="a:b"></button>', "state"],
    ['<p data-state-text="a"></p>', "state"],
    ['<div data-state-in-view="a=b"></div>', "state-view"],
    ['<div data-state-compute="variant-match"></div>', "state-compute"],
    ['<button data-chat-send="q"></button>', "chat"],
    ["<div data-chat id=\"c\" hidden></div>", "chat"],
    ['<button data-on="click:x"></button>', "on"],
  ];
  for (const [html, chunk] of cases)
    it(`${html} loads only ${chunk}`, async () => {
      const requested: string[] = [];
      setChunkLoader(async (url) => (requested.push(url), {} satisfies ChunkModule));
      resetDom(html);
      const stop = start(document, cfg);
      await tick();
      stop();
      assert.deepEqual(requested, [`/c/${chunk}.js`]);
    });
  it("scroll-smoothing on a scroll-effect section is not an overflow chunk", () => {
    resetDom('<section data-scroll-effect="timeline" data-scroll-smoothing="0.5"></section>');
    assert.equal(document.querySelectorAll(CHUNK_SELECTORS.overflow).length, 0);
  });
  it("creates the PageHub global before any chunk", () => {
    resetDom("<p>hi</p>");
    delete w.PageHub;
    const stop = start(document, cfg);
    stop();
    assert.equal(typeof w.PageHub.on, "function");
  });
});

describe("state store", () => {
  it("evaluates conditions", () => {
    const k = K();
    assert.equal(cond(k), false);
    assert.equal(cond("!" + k), true);
    set(k, "4");
    assert.ok(cond(k) && cond(`${k}=4`) && cond(`${k}!=5`) && cond(`${k}>3`) && !cond(`${k}>10`) && cond(`${k}<=4`));
  });
  it("local: keys persist in localStorage and survive a cleared cache", () => {
    resetDom();
    set("local:theme", "dark");
    assert.equal(localStorage.getItem("ph-state:local:theme"), "dark");
    set("local:theme", undefined);
    assert.equal(localStorage.getItem("ph-state:local:theme"), null);
  });
  it("same value does not notify", () => {
    const k = K();
    set(k, "a");
    const fn = mock.fn();
    const off = subscribe(fn);
    set(k, "a");
    off();
    assert.equal(fn.mock.callCount(), 0);
  });
  it("parses colon-namespaced keys and ||/&& expressions", () => {
    set("store:filter", undefined);
    assert.equal(cond("!store:filter"), true); // unset
    assert.equal(cond("store:filter=all||store:filter=people"), false);
    set("store:filter", "people");
    assert.equal(cond("!store:filter"), false);
    assert.equal(cond("!store:filter||store:filter=all||store:filter=people"), true); // matches
    assert.equal(cond("!store:filter||store:filter=all||store:filter=process"), false); // no match
    assert.equal(cond("store:filter=people&&store:filter!=all"), true); // AND
    set("store:filter", undefined);
  });
});

describe("state chunk", () => {
  it("set / toggle / clear on click, with local: keys", () => {
    const [a, b, c] = [K(), K(), "local:" + K()];
    resetDom(`<button id=s data-state-set="${a}:x"></button><button id=t data-state-toggle="${b}"></button><button id=c data-state-clear="${c}"></button>`);
    set(c, "v");
    mountAll(state, "button");
    fire(q("#s"), "click");
    assert.equal(get(a), "x");
    fire(q("#t"), "click");
    assert.equal(get(b), "true");
    fire(q("#t"), "click");
    assert.equal(get(b), undefined);
    fire(q("#c"), "click");
    assert.equal(get(c), undefined);
  });
  it("toggle between two values", () => {
    const k = K();
    resetDom(`<button data-state-toggle="${k}:on|off"></button>`);
    mountAll(state, "button");
    fire(q("button"), "click");
    assert.equal(get(k), "on");
    fire(q("button"), "click");
    assert.equal(get(k), "off");
  });
  it("step clamps, wraps, and runs on an interval", () => {
    const [a, b, c] = [K(), K(), K()];
    resetDom(`<button id=a data-state-step="${a}:+1" data-min=0 data-max=2></button><button id=b data-state-step="${b}:+1" data-min=0 data-max=2 data-wrap></button><i id=c data-state-step="${c}:+1" data-every="2s"></i>`);
    mock.timers.enable({ apis: ["setInterval"] });
    mountAll(state, "[data-state-step]");
    for (let i = 0; i < 4; i++) (fire(q("#a"), "click"), fire(q("#b"), "click"));
    assert.equal(get(a), "2");
    assert.equal(get(b), "1"); // 1,2,0,1
    mock.timers.tick(4000);
    mock.timers.reset();
    assert.equal(get(c), "2");
  });
  it("step down below min wraps to max", () => {
    const k = K();
    resetDom(`<button data-state-step="${k}:-1" data-min=1 data-max=3 data-wrap></button>`);
    mountAll(state, "button");
    fire(q("button"), "click");
    assert.equal(get(k), "3");
  });
  it("data-state-on load and hover", () => {
    const [a, b] = [K(), K()];
    resetDom(`<i data-state-set="${a}:1" data-state-on="load"></i><i id=h data-state-set="${b}:1" data-state-on="hover"></i>`);
    mountAll(state, "i");
    assert.equal(get(a), "1");
    assert.equal(get(b), undefined);
    fire(q("#h"), "mouseenter");
    assert.equal(get(b), "1");
  });
  it("show / text / class follow the state", () => {
    const k = K();
    resetDom(`<p id=s data-state-show="${k}=open">s</p><b id=t data-state-text="${k}"></b><i id=c data-state-class="${k}=open:bg-a md:text-b; !${k}:idle"></i>`);
    mountAll(state, "p,b,i");
    assert.ok(q("#s").hidden);
    assert.ok(q("#c").classList.contains("idle"));
    set(k, "open");
    assert.ok(!q("#s").hidden);
    assert.equal(q("#t").textContent, "open");
    assert.deepEqual([...q("#c").classList].sort(), ["bg-a", "md:text-b"]);
  });
  it("text and src walk into a JSON state value; an empty value keeps the rendered src", () => {
    const k = K();
    resetDom(`<b id=t data-state-text="${k}.formatted"></b><img id=i src="/a.png" data-state-src="{{state.${k}.image}}">`);
    mountAll(state, "b,img");
    assert.equal(q("#t").textContent, "");
    assert.equal(q("#i").getAttribute("src"), "/a.png");
    set(k, JSON.stringify({ formatted: "$9", image: "/b.png" }));
    assert.equal(q("#t").textContent, "$9");
    assert.equal(q("#i").getAttribute("src"), "/b.png");
    set(k, undefined);
    assert.equal(q("#i").getAttribute("src"), "/a.png");
  });
  it("class entries accept local: keys", () => {
    resetDom(`<i data-state-class="local:tab=a:on"></i>`);
    set("local:tab", "a");
    mountAll(state, "i");
    assert.ok(q("i").classList.contains("on"));
  });
  it("class entries written test=>classes take namespaced keys and && / || expressions", () => {
    set("store:f", undefined);
    set("gp:n", undefined);
    resetDom(`<i data-state-class="!store:f||store:f=all=>on-all md:x; store:f=a&&gp:n>1=>both; plainkey:legacy"></i>`);
    set("plainkey", "1");
    mountAll(state, "i");
    assert.deepEqual([...q("i").classList].sort(), ["legacy", "md:x", "on-all"]);
    set("store:f", "a");
    set("gp:n", "2");
    assert.deepEqual([...q("i").classList].sort(), ["both", "legacy"]);
    set("store:f", undefined);
    set("gp:n", undefined);
  });
  it("a condition walks into a JSON value: key.field is set when the field is non-empty", () => {
    const k = K();
    resetDom(`<p id=a data-state-show="${k}.image">a</p><p id=b data-state-show="!${k}||!${k}.image">b</p>`);
    mountAll(state, "p");
    assert.ok(q("#a").hidden && !q("#b").hidden);
    set(k, JSON.stringify({ image: "/x.png" }));
    assert.ok(!q("#a").hidden && q("#b").hidden);
    set(k, JSON.stringify({ image: null }));
    assert.ok(q("#a").hidden && !q("#b").hidden);
    set(k, undefined);
  });
  it("namespaced filter: a chip's data-state-set drives card data-state-show visibility", () => {
    // The marcusmares "Solution Store" shape: chips set a colon-namespaced key, cards gate on it.
    set("store:filter", undefined);
    resetDom(
      `<button id=all data-state-set="store:filter:all"></button>` +
        `<button id=people data-state-set="store:filter:people"></button>` +
        `<div id=cp data-state-show="!store:filter||store:filter=all||store:filter=people">people</div>` +
        `<div id=cs data-state-show="!store:filter||store:filter=all||store:filter=process">process</div>`,
    );
    mountAll(state, "button,div");
    assert.ok(!q("#cp").hidden && !q("#cs").hidden, "unset filter shows every card");
    fire(q("#people"), "click");
    assert.equal(get("store:filter"), "people"); // splitKey: key store:filter, value people
    assert.ok(!q("#cp").hidden, "people card stays");
    assert.ok(q("#cs").hidden, "process card hides");
    fire(q("#all"), "click");
    assert.equal(get("store:filter"), "all");
    assert.ok(!q("#cp").hidden && !q("#cs").hidden, "All re-shows every card");
    set("store:filter", undefined);
  });
  it("bind: input writes state (debounced), checked mode, and state writes the control", () => {
    const [a, b] = [K(), K()];
    resetDom(`<input id=i data-state-bind="${a}" data-debounce="200ms"><input id=c type=checkbox value=red data-state-bind="${b}" data-bind-mode=checked>`);
    mock.timers.enable({ apis: ["setTimeout"] });
    mountAll(state, "input");
    const i = q("#i") as HTMLInputElement;
    i.value = "hi";
    fire(i, "input");
    assert.equal(get(a), undefined);
    mock.timers.tick(200);
    mock.timers.reset();
    assert.equal(get(a), "hi");
    const c = q("#c") as HTMLInputElement;
    c.checked = true;
    fire(c, "change");
    assert.equal(get(b), "red");
    set(a, "yo");
    assert.equal(i.value, "yo");
  });
  it("bind: url: keys mirror to the query string", () => {
    resetDom(`<input data-state-bind="url:q">`);
    mountAll(state, "input");
    const i = q("input") as HTMLInputElement;
    i.value = "tees";
    fire(i, "input");
    assert.equal(new URLSearchParams(location.search).get("q"), "tees");
    i.value = "";
    fire(i, "input");
    assert.equal(new URLSearchParams(location.search).get("q"), null);
  });
});

describe("state-view (in-view)", () => {
  it("the most visible member writes key, index, number and count", () => {
    const k = K();
    resetDom(`<s id=a data-state-in-view="${k}=one"></s><s id=b data-state-in-view="${k}=two"></s>`);
    useIO();
    mountAll(stateView, "s");
    const [a, b] = [q("#a"), q("#b")];
    FakeIO.all[0]!.cb([{ target: a, isIntersecting: true, intersectionRatio: 0.3 }]);
    FakeIO.all[1]!.cb([{ target: b, isIntersecting: true, intersectionRatio: 0.9 }]);
    assert.equal(get(k), "two");
    assert.equal(get(k + ":index"), "1");
    assert.equal(get(k + ":number"), "2");
    assert.equal(get(k + ":count"), "2");
  });
});

describe("state-view (in-view) removed members", () => {
  it("a member that left the page is forgotten: re-created markup is counted once", () => {
    const k = K();
    resetDom(`<div id=host><s id=a data-state-in-view="${k}=one"></s><s id=b data-state-in-view="${k}=two"></s></div>`);
    useIO();
    mountAll(stateView, "s");
    q("#host").innerHTML = `<s id=c data-state-in-view="${k}=one"></s><s id=d data-state-in-view="${k}=two"></s>`;
    mountAll(stateView, "s");
    FakeIO.all[3]!.cb([{ target: q("#d"), isIntersecting: true, intersectionRatio: 0.9 }]);
    assert.equal(get(k + ":count"), "2");
    assert.equal(get(k + ":number"), "2");
  });
});

describe("state-compute (variant-match)", () => {
  it("writes the matching variant id once every axis is picked", () => {
    const vars = JSON.stringify([{ id: "v1", option1: "M", option2: "Red" }, { id: "v2", option1: "L", option2: "Red", formatted: "$9" }, { id: "v3", option1: "XL", option2: "Red", inventory: 0 }]);
    resetDom(`<div data-state-compute="variant-match" data-compute-key="pdp:v" data-variants='${vars}' data-axes="Size,Color" data-axis-key="pdp:axis:%axis%"></div>`);
    stateCompute.mount(q("div"));
    set("pdp:axis:Size", "L");
    assert.equal(get("pdp:v"), undefined);
    set("pdp:axis:Color", "Red");
    assert.equal(JSON.parse(get("pdp:v")!).id, "v2");
    set("pdp:axis:Size", "XL"); // sold out: no match
    assert.equal(get("pdp:v"), undefined);
    set("pdp:axis:Size", "XS");
    assert.equal(get("pdp:v"), undefined);
  });
  it("count writes how many of the source keys hold the value, and follows them", () => {
    resetDom(`<div data-state-compute="count" data-compute-key="cnt:score" data-from="cnt:q1, cnt:q2,cnt:q3" data-count-value="Y"></div>`);
    for (const k of ["cnt:q1", "cnt:q2", "cnt:q3"]) set(k, undefined);
    stateCompute.mount(q("div"));
    assert.equal(get("cnt:score"), "0");
    set("cnt:q1", "Y");
    set("cnt:q2", "N");
    set("cnt:q3", "Y");
    assert.equal(get("cnt:score"), "2");
    set("cnt:q3", "N");
    assert.equal(get("cnt:score"), "1");
  });
  it("bad JSON is ignored", () => {
    resetDom(`<div data-state-compute="variant-match" data-variants="{oops"></div>`);
    assert.doesNotThrow(() => stateCompute.mount(q("div")));
  });
});
