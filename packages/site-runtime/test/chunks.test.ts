import { readFileSync } from "node:fs";
import { fire, resetDom, tick } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import * as animate from "../src/chunks/animate.ts";
import * as autoplay from "../src/chunks/autoplay.ts";
import * as cart from "../src/chunks/cart.ts";
import * as cartItems from "../src/chunks/cart-items.ts";
import * as form from "../src/chunks/form.ts";
import * as invokers from "../src/chunks/invokers.ts";
import * as show from "../src/chunks/show.ts";
import * as scrollspy from "../src/chunks/scrollspy.ts";
import * as track from "../src/chunks/track.ts";
import { get, set } from "../src/state-store.ts";

const cfg = { chunkBase: "/c/" };
const g = globalThis as any;
const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((f) => f()));

class FakeIO {
  static all: FakeIO[] = [];
  observed = new Set<Element>();
  constructor(public cb: (e: any[]) => void) {
    FakeIO.all.push(this);
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() {}
  emit(entries: { target: Element; isIntersecting: boolean; intersectionRatio: number }[]) { this.cb(entries); }
}
const useIO = () => {
  FakeIO.all = [];
  (window as any).IntersectionObserver = FakeIO;
};
const motion = (reduce: boolean) => ((window as any).matchMedia = (q: string) => ({ matches: reduce && q.includes("reduced-motion") }));

describe("animate", () => {
  it("adds the class once when scrolled into view", () => {
    resetDom('<div data-animate="fade-up"></div>');
    useIO();
    motion(false);
    const el = document.querySelector("div")!;
    animate.mount(el);
    assert.ok(!el.classList.contains("animate-css-fade-up"));
    const io = FakeIO.all.at(-1)!;
    io.emit([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
    assert.ok(el.classList.contains("animate-css-fade-up"));
    assert.ok(el.hasAttribute("data-animated"));
    assert.ok(!io.observed.has(el));
  });
  it("reduced motion: visible, no class", () => {
    resetDom('<div data-animate="fade-up"></div>');
    motion(true);
    const el = document.querySelector("div")!;
    animate.mount(el);
    assert.ok(el.hasAttribute("data-animated"));
    assert.equal(el.className, "");
  });
});

describe("autoplay", () => {
  const setup = () => {
    resetDom('<div data-autoplay="5s"><i></i><i></i><i></i></div>');
    const t = document.querySelector("div") as HTMLElement;
    Object.defineProperties(t, {
      scrollWidth: { value: 300 },
      clientWidth: { value: 100 },
    });
    t.querySelectorAll("i").forEach((i) => Object.defineProperty(i, "offsetWidth", { value: 100 }));
    return t;
  };
  it("advances one item per tick and wraps at the end", () => {
    motion(false);
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      const t = setup();
      autoplay.mount(t);
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 100);
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 200);
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 0);
    } finally {
      mock.timers.reset();
    }
  });
  it("pauses on hover, hidden tab and reduced motion", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      motion(false);
      const t = setup();
      autoplay.mount(t);
      fire(t, "pointerenter");
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 0);
      fire(t, "pointerleave");
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 0);
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      motion(true);
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 0);
      motion(false);
      mock.timers.tick(5000);
      assert.equal(t.scrollLeft, 100);
    } finally {
      mock.timers.reset();
    }
  });
});

describe("scrollspy", () => {
  it("marks the link of the most visible section", () => {
    resetDom('<nav data-scrollspy><a href="#a">A</a><a href="#b">B</a></nav><section id="a"></section><section id="b"></section>');
    useIO();
    scrollspy.mount(document.querySelector("nav")!);
    const io = FakeIO.all.at(-1)!;
    const [a, b] = [document.getElementById("a")!, document.getElementById("b")!];
    io.emit([{ target: a, isIntersecting: true, intersectionRatio: 0.3 }, { target: b, isIntersecting: true, intersectionRatio: 0.7 }]);
    const links = document.querySelectorAll("a");
    assert.equal(links[1]!.getAttribute("aria-current"), "true");
    assert.equal(links[0]!.getAttribute("aria-current"), null);
    io.emit([{ target: b, isIntersecting: false, intersectionRatio: 0 }]);
    assert.equal(links[0]!.getAttribute("aria-current"), "true");
    assert.equal(links[1]!.getAttribute("aria-current"), null);
  });
});

describe("track", () => {
  it("ga4 pushes to dataLayer when gtag is absent, calls gtag when present", () => {
    resetDom('<a data-track="ga4:generate_lead" href="#">x</a><form data-track="ga4:signup"><button></button></form>');
    const w = window as any;
    w.dataLayer = [];
    stops.push(track.init(document, cfg));
    fire(document.querySelector("a")!, "click");
    assert.deepEqual(w.dataLayer, [{ event: "generate_lead" }]);
    w.gtag = mock.fn();
    fire(document.querySelector("form")!, "submit");
    assert.deepEqual(w.gtag.mock.calls[0].arguments, ["event", "signup"]);
  });
  it("unknown provider is a no-op; adapters from config win", () => {
    resetDom('<button data-track="nope:x">a</button><button data-track="mine:y">b</button>');
    const adapter = mock.fn();
    stops.push(track.init(document, { ...cfg, track: { adapters: { mine: adapter } } }));
    const [a, b] = document.querySelectorAll("button");
    fire(a!, "click");
    assert.equal(adapter.mock.callCount(), 0);
    fire(b!, "click");
    assert.equal(adapter.mock.calls[0]!.arguments[0], "y");
  });
});

describe("cart", () => {
  beforeEach(() => ["cart:count", "cart:total", "cart:items-json", "cart:open", "cart:error", "cart:promo", "cart:checkout-status"].forEach((k) => set(k, undefined)));
  const priced = (id: string, cents: number, extra = "") =>
    `data-cart="add" data-cart-item='${JSON.stringify({ id, title: "T " + id, image: "/i.png", price: { amount: cents, formatted: "$" + cents / 100, currency: "usd" }, metadata: { priceId: "price_" + id } })}'${extra}`;
  const text = (sel: string) => document.querySelector(sel)!.textContent;

  it("hand-written markup adds, counts and builds a checkout url", async () => {
    resetDom('<span data-cart-count>0</span><button data-cart="add" data-cart-id="sku1" data-cart-qty="2">+</button><button data-cart="checkout">go</button>');
    const assign = mock.fn();
    Object.defineProperty(window, "location", { value: { assign, origin: "http://x", pathname: "/", href: "http://x/", search: "" }, configurable: true });
    stops.push(cart.init(document, { chunkBase: "/c/", cart: { endpoint: "/pay" } }));
    const [add, out] = document.querySelectorAll("button");
    fire(add!, "click");
    await tick(5);
    fire(add!, "click");
    await tick(5);
    assert.equal(text("[data-cart-count]"), "4");
    fire(out!, "click");
    await tick(5);
    assert.equal(assign.mock.calls[0]!.arguments[0], "/pay?items=sku1:4");
  });

  it("publishes cart:count / cart:total, renders line items and drives qty and remove", async () => {
    resetDom(
      `<button ${priced("a", 1500, ' data-cart-qty="2"')}>a</button><button ${priced("b", 400)}>b</button>` +
        '<div data-cart-items data-empty-text="Empty" data-empty-class="e" data-empty-text-class="et" data-list-class="l" data-row-class="r" data-image-class="im" data-body-class="bd" data-title-class="ti" data-variant-class="va" data-price-class="pr" data-controls-class="co" data-quantity-class="qt" data-control-button-class="cb" data-remove-button-class="rm"></div>',
    );
    stops.push(cart.init(document, cfg));
    cartItems.mount(document.querySelector("[data-cart-items]")!);
    await tick(5);
    assert.equal(text("[data-cart-items] .et"), "Empty");
    const [a, b] = document.querySelectorAll<HTMLElement>("button[data-cart=add]");
    fire(a!, "click");
    await tick(5);
    fire(b!, "click");
    await tick(5);
    assert.equal(get("cart:count"), "3");
    assert.equal(get("cart:total"), "$34.00");
    assert.equal(get("cart:open"), "true", "adding opens the drawer");
    const rows = document.querySelectorAll("[data-cart-items] .r");
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.querySelector(".ti")!.textContent, "T a");
    assert.equal(rows[0]!.querySelector(".pr")!.textContent, "$15");
    assert.equal(rows[0]!.querySelector("img")!.getAttribute("src"), "/i.png");
    assert.equal(rows[0]!.querySelector(".qt")!.textContent, "2");
    fire(rows[0]!.querySelector<HTMLElement>('[data-cart-line="inc"]')!, "click");
    await tick(5);
    assert.equal(get("cart:count"), "4");
    fire(document.querySelector<HTMLElement>('[data-cart-line="remove"]')!, "click");
    await tick(5);
    assert.equal(get("cart:count"), "1");
    assert.equal(get("cart:total"), "$4.00");
    fire(document.querySelector<HTMLElement>('[data-cart-line="dec"]')!, "click");
    await tick(5);
    assert.equal(get("cart:count"), "0");
    assert.equal(get("cart:total"), undefined);
    assert.equal(text("[data-cart-items] .et"), "Empty");
  });

  it("Escape closes the open drawer", async () => {
    resetDom(`<button ${priced("a", 100)}>a</button><div data-state-show="cart:open"></div>`);
    stops.push(cart.init(document, cfg));
    await tick(5);
    fire(document.querySelector("button")!, "click");
    await tick(5);
    assert.equal(get("cart:open"), "true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(get("cart:open"), undefined);
  });

  it("checkout posts cart.body and the lines to cart.api and keys the cart by cart.key", async () => {
    resetDom(`<button ${priced("a", 100)}>a</button><button data-cart="checkout" data-cart-success="/thanks">go</button>`);
    const assign = mock.fn();
    Object.defineProperty(window, "location", { value: { assign, origin: "http://x", pathname: "/p", href: "http://x/p", search: "" }, configurable: true });
    const fetched: any[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any) => (fetched.push([url, JSON.parse(init.body)]), { json: async () => ({ url: "https://stripe.test/s" }) })) as any;
    try {
      stops.push(cart.init(document, { chunkBase: "/c/", cart: { key: "shop-pg1", api: "/pay/session", body: { pageId: "pg1" } } }));
      await tick(5);
      fire(document.querySelectorAll("button")[0]!, "click");
      await tick(5);
      assert.ok(localStorage.getItem("shop-pg1"));
      fire(document.querySelectorAll("button")[1]!, "click");
      await tick(5);
    } finally {
      globalThis.fetch = real;
    }
    assert.equal(fetched[0][0], "/pay/session");
    assert.deepEqual(fetched[0][1], { pageId: "pg1", items: [{ priceId: "price_a", quantity: 1 }], successUrl: "http://x/thanks?checkout=success", cancelUrl: "http://x/p?checkout=cancel" });
    assert.equal(assign.mock.calls[0]!.arguments[0], "https://stripe.test/s");
  });

  it("with no cart.api there is no hosted checkout: no request is made, the key defaults to `cart`", async () => {
    resetDom(`<button ${priced("a", 100)}>a</button><button data-cart="checkout">go</button>`);
    const assign = mock.fn();
    Object.defineProperty(window, "location", { value: { assign, origin: "http://x", pathname: "/p", href: "http://x/p", search: "" }, configurable: true });
    const real = globalThis.fetch;
    const fetched: unknown[] = [];
    globalThis.fetch = (async (...a: unknown[]) => (fetched.push(a), { json: async () => ({}) })) as any;
    try {
      stops.push(cart.init(document, { chunkBase: "/c/", cart: { body: { pageId: "ignored" } } }));
      await tick(5);
      fire(document.querySelectorAll("button")[0]!, "click");
      await tick(5);
      assert.ok(localStorage.getItem("cart"));
      fire(document.querySelectorAll("button")[1]!, "click");
      await tick(5);
    } finally {
      globalThis.fetch = real;
    }
    assert.equal(fetched.length, 0);
    assert.equal(assign.mock.calls[0]!.arguments[0], "/checkout?items=price_a:1");
  });

  it("a multi-variant item needs its options picked, then adds the matched variant", async () => {
    const item = {
      id: "p", title: "Fern", price: { amount: 4500, formatted: "$45.00", currency: "usd" }, metadata: { priceId: "base" },
      hasMultipleVariants: true, optionNamesCsv: "Pot",
      variantMapJson: JSON.stringify([{ option1: "Cream", priceId: "v_cream", amount: 5000, formatted: "$50.00" }, { option1: "Sage", priceId: "v_sage", amount: 4500, formatted: "$45.00" }]),
    };
    resetDom(`<button data-cart="add" data-cart-variant-axes="pdp:axis:%axis%" data-cart-item='${JSON.stringify(item)}'>add</button><div data-cart-items data-row-class="r" data-variant-class="va"></div>`);
    stops.push(cart.init(document, cfg));
    cartItems.mount(document.querySelector("[data-cart-items]")!);
    await tick(5);
    fire(document.querySelector("button")!, "click");
    await tick(5);
    assert.equal(get("cart:error"), "Select an option before adding to cart");
    assert.equal(get("cart:count"), "0");
    set("pdp:axis:Pot", "Cream");
    fire(document.querySelector("button")!, "click");
    await tick(5);
    assert.equal(get("cart:error"), undefined);
    assert.equal(get("cart:total"), "$50.00");
    assert.equal(text("[data-cart-items] .va"), "Cream");
  });

  it("open toggles cart:open for a drawer; without a drawer a link is left alone", async () => {
    resetDom('<button data-cart="open" id="o">o</button><div data-state-show="cart:open" hidden></div>');
    stops.push(cart.init(document, cfg));
    fire(document.getElementById("o")!, "click");
    assert.equal(get("cart:open"), "true");
    fire(document.getElementById("o")!, "click");
    assert.equal(get("cart:open"), undefined);
    resetDom('<a href="/cart" data-cart="open" id="l">c</a>');
    stops.pop()!();
    stops.push(cart.init(document, cfg));
    const click = new Event("click", { bubbles: true, cancelable: true });
    document.getElementById("l")!.dispatchEvent(click);
    assert.equal(click.defaultPrevented, false);
  });

  it("form add reads id and quantity fields", async () => {
    resetDom('<span data-cart-count></span><form data-cart="add"><input name="id" value="p9"><input name="quantity" value="3"><button>add</button></form>');
    stops.push(cart.init(document, cfg));
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    assert.equal(text("[data-cart-count]"), "3");
  });

  it("a booking form builds its line from its fields and checks out with them as details", async () => {
    resetDom(
      '<form data-cart="add" data-cart-then="checkout" data-cart-id-template="pd:abc/calendar={checkIn}..{checkOut}">' +
        '<input name="checkIn" value="2026-11-02"><input name="checkOut" value="2026-11-05"><input name="guests" value="4"><input name="note" value=""><button>book</button></form>'
    );
    const assign = mock.fn();
    Object.defineProperty(window, "location", { value: { assign, origin: "https://stay.test", pathname: "/stay/dune", href: "https://stay.test/stay/dune", search: "" }, configurable: true });
    const calls: any[] = [];
    g.fetch = async (url: string, init: any) => (calls.push([url, JSON.parse(init.body)]), { json: async () => ({ url: "https://stripe.test/b" }) });
    stops.push(cart.init(document, { chunkBase: "/c/", cart: { api: "/pay/session", key: "cart-booking", body: { pageId: "pg3" } } }));
    fire(document.querySelector("form")!, "submit");
    await tick(8);
    assert.deepEqual(calls[0][1].items, [{ priceId: "pd:abc/calendar=2026-11-02..2026-11-05", quantity: 1 }]);
    assert.deepEqual(calls[0][1].details, { checkIn: "2026-11-02", checkOut: "2026-11-05", guests: "4" }, "empty fields left out");
    assert.equal(assign.mock.calls[0]!.arguments[0], "https://stripe.test/b");
  });

  it("a booking form with an empty templated field says so and adds nothing", async () => {
    resetDom('<span data-cart-count>0</span><form data-cart="add" data-cart-id-template="pd:abc/calendar={checkIn}..{checkOut}"><input name="checkIn" value="2026-11-02"><input name="checkOut" value=""><button>book</button></form>');
    stops.push(cart.init(document, { chunkBase: "/c/", cart: { key: "cart-booking-2" } }));
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    assert.equal(get("cart:error"), "Fill in every field first");
    assert.equal(text("[data-cart-count]"), "0");
    set("cart:error", undefined);
  });

  it("checkout posts the lines the way storefront carts do and follows the url", async () => {
    resetDom(`<button ${priced("a", 1500)}>a</button><button data-cart="checkout" data-cart-success="/thanks">go</button>`);
    const assign = mock.fn();
    Object.defineProperty(window, "location", { value: { assign, origin: "https://shop.test", pathname: "/shop", href: "https://shop.test/shop", search: "" }, configurable: true });
    const calls: any[] = [];
    g.fetch = async (url: string, init: any) => (calls.push([url, JSON.parse(init.body)]), { json: async () => ({ url: "https://stripe.test/s" }) });
    set("cart:promo", "SAVE10");
    stops.push(cart.init(document, { chunkBase: "/c/", cart: { api: "/pay/session", body: { pageId: "pg1" } } }));
    const [add, out] = document.querySelectorAll("button");
    fire(add!, "click");
    await tick(5);
    fire(out!, "click");
    await tick(5);
    assert.equal(calls[0][0], "/pay/session");
    assert.deepEqual(calls[0][1], {
      pageId: "pg1",
      items: [{ priceId: "price_a", quantity: 1 }],
      successUrl: "https://shop.test/thanks?checkout=success",
      cancelUrl: "https://shop.test/shop?checkout=cancel",
      promotionCode: "SAVE10",
    });
    assert.equal(assign.mock.calls[0]!.arguments[0], "https://stripe.test/s");
    set("cart:promo", undefined);
  });

  it("a failed checkout sets cart:error", async () => {
    resetDom(`<button ${priced("a", 1500)}>a</button><button data-cart="checkout">go</button>`);
    g.fetch = async () => ({ json: async () => ({ error: "Out of stock" }) });
    stops.push(cart.init(document, { chunkBase: "/c/", cart: { api: "/pay/session", body: { pageId: "pg2" } } }));
    const [add, out] = document.querySelectorAll("button");
    fire(add!, "click");
    await tick(5);
    fire(out!, "click");
    await tick(5);
    assert.equal(get("cart:error"), "Out of stock");
  });

  it("edit mode renders but does nothing on click", async () => {
    resetDom(`<button ${priced("a", 1500)}>a</button>`);
    document.documentElement.setAttribute("data-ph-edit", "");
    stops.push(cart.init(document, cfg));
    fire(document.querySelector("button")!, "click");
    await tick(5);
    assert.equal(get("cart:count"), "0");
    document.documentElement.removeAttribute("data-ph-edit");
  });

  it("a custom adapter replaces localStorage", async () => {
    resetDom('<span data-cart-count></span><button data-cart="add" data-cart-id="z">+</button>');
    const none = { items: [], count: 1, totalAmount: 0, total: "" };
    const add = mock.fn(async () => ({ ...none, count: 9 }));
    stops.push(cart.init(document, { chunkBase: "/c/", cart: { adapter: { get: async () => none, add, setQuantity: async () => none, clear: async () => none, checkout: async () => "/x" } } }));
    await tick(5);
    assert.equal(text("[data-cart-count]"), "1");
    fire(document.querySelector("button")!, "click");
    await tick(5);
    assert.equal(text("[data-cart-count]"), "9");
  });
});

describe("form enhance", () => {
  const html = '<form method="post" action="/f"><input name="a" value="1"><button>go</button><p data-form-state="sending" hidden></p><p data-form-state="sent" hidden></p><p data-form-state="error" hidden></p></form>';
  const shown = () => [...document.querySelectorAll<HTMLElement>("[data-form-state]")].filter((e) => !e.hidden).map((e) => e.getAttribute("data-form-state"));
  it("posts with fetch and shows sent", async () => {
    resetDom(html);
    const calls: any[] = [];
    g.fetch = async (url: string, init: any) => (calls.push([url, init]), { ok: true });
    form.mount(document.querySelector("[data-form-state]")!);
    fire(document.querySelector("form")!, "submit");
    assert.deepEqual(shown(), ["sending"]);
    await tick(5);
    assert.deepEqual(shown(), ["sent"]);
    assert.equal(calls[0][0], "https://example.test/f");
    assert.equal(calls[0][1].method, "POST");
  });
  it("shows error on a failed response or a thrown fetch", async () => {
    resetDom(html);
    g.fetch = async () => ({ ok: false });
    form.mount(document.querySelector("[data-form-state]")!);
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    assert.deepEqual(shown(), ["error"]);
    g.fetch = async () => { throw new Error("offline"); };
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    assert.deepEqual(shown(), ["error"]);
  });
  it("on error keeps the fields visible with values, shows the authored error as an alert, and resubmits", async () => {
    resetDom('<form method="post" action="/f"><div data-form-state="idle"><input name="a" value="typed"><button>go</button></div><p data-form-state="sending" hidden></p><p data-form-state="sent" hidden></p><p data-form-state="error" hidden>Nope</p></form>');
    g.fetch = async () => ({ ok: false });
    document.querySelectorAll("[data-form-state]").forEach((e) => form.mount(e));
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    assert.deepEqual(shown(), ["idle", "error"]);
    assert.equal(document.querySelector<HTMLInputElement>("input")!.value, "typed");
    const err = document.querySelector<HTMLElement>('[data-form-state="error"]')!;
    assert.equal(err.getAttribute("role"), "alert");
    assert.equal(document.activeElement, err);
    let posts = 0;
    g.fetch = async () => (posts++, { ok: true });
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    assert.equal(posts, 1);
    assert.deepEqual(shown(), ["sent"]);
  });
  it("adds a default alert message when no error slot is authored, and clears it on retry", async () => {
    resetDom('<form method="post" action="/f"><input name="a" value="v"><button>go</button><p data-form-state="sent" hidden></p></form>');
    g.fetch = async () => ({ ok: false });
    form.mount(document.querySelector("[data-form-state]")!);
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    const msg = document.querySelector<HTMLElement>("[data-form-error]")!;
    assert.equal(msg.hidden, false);
    assert.equal(msg.getAttribute("role"), "alert");
    assert.equal(document.querySelector<HTMLInputElement>("input")!.value, "v");
    g.fetch = async () => new Promise(() => {});
    fire(document.querySelector("form")!, "submit");
    assert.equal(msg.hidden, true);
  });
  it("never posts in the editing canvas: the canvas is the dashboard's origin, so a fetch there carries its session", async () => {
    resetDom(html);
    document.documentElement.setAttribute("data-ph-edit", "");
    let posts = 0;
    g.fetch = async () => (posts++, { ok: true });
    form.mount(document.querySelector("[data-form-state]")!);
    fire(document.querySelector("form")!, "submit");
    await tick(5);
    document.documentElement.removeAttribute("data-ph-edit");
    assert.equal(posts, 0);
    assert.deepEqual(shown(), []);
  });
});

describe("invokers", () => {
  it("loads the polyfill only when unsupported", async () => {
    resetDom();
    const load = mock.fn(async () => {});
    const proto = (window as any).HTMLButtonElement.prototype;
    delete proto.commandForElement;
    await invokers.init(document, cfg, load);
    assert.equal(load.mock.callCount(), 1);
    Object.defineProperty(proto, "commandForElement", { value: null, configurable: true });
    await invokers.init(document, cfg, load);
    assert.equal(load.mock.callCount(), 1);
    delete proto.commandForElement;
  });
});

describe("show", () => {
  afterEach(() => localStorage.clear());
  const hidden = (id: string) => document.getElementById(id)!.classList.contains("hidden");

  it("load: opens the target when the localStorage gate passes, stays closed once the key is set", () => {
    resetDom('<div id="b" class="hidden" data-show-on="load" data-show-target="b" data-show-dir="show" data-show-if="!ls:seen"></div>');
    show.mount(document.getElementById("b")!);
    assert.equal(hidden("b"), false);
    resetDom('<div id="b" class="hidden" data-show-on="load" data-show-target="b" data-show-dir="show" data-show-if="!ls:seen"></div>');
    localStorage.setItem("seen", "1");
    show.mount(document.getElementById("b")!);
    assert.equal(hidden("b"), true);
  });

  it("hover: shows on enter, hides on leave", () => {
    resetDom('<a id="t" data-show-on="hover" data-show-target="m" data-show-dir="show"></a><div id="m" class="hidden"></div>');
    show.mount(document.getElementById("t")!);
    fire(document.getElementById("t")!, "pointerenter");
    assert.equal(hidden("m"), false);
    fire(document.getElementById("t")!, "pointerleave");
    assert.equal(hidden("m"), true);
  });

  it("load/hover stay off in the editing canvas", () => {
    resetDom('<div id="b" class="hidden" data-show-on="load" data-show-dir="show"></div>');
    document.documentElement.setAttribute("data-ph-edit", "");
    show.mount(document.getElementById("b")!);
    document.documentElement.removeAttribute("data-ph-edit");
    assert.equal(hidden("b"), true);
  });

  it("tab: click hides the group's panels and shows the target", () => {
    resetDom('<button id="t" data-tab-target="p2" data-tab-of="g"></button><div id="p1" data-tab-group="g"></div><div id="p2" class="hidden" data-tab-group="g"></div>');
    show.mount(document.getElementById("t")!);
    fire(document.getElementById("t")!, "click");
    assert.equal(hidden("p1"), true);
    assert.equal(hidden("p2"), false);
  });

  it("popover drawer: open drops `hidden`, close restores it, and no inline display is ever set (so lg:hidden keeps winning)", () => {
    resetDom('<div id="d" class="hidden ph-drawer lg:hidden" popover="manual"></div>');
    const d = document.getElementById("d")!;
    stops.push(show.init(document));
    const send = (newState: string) => {
      const e = new Event("beforetoggle", { bubbles: true }) as Event & { newState?: string };
      e.newState = newState;
      d.dispatchEvent(e);
    };
    send("open");
    assert.equal(hidden("d"), false, "open: hidden class removed");
    assert.ok(d.classList.contains("lg:hidden"), "responsive class untouched");
    assert.equal(d.style.display, "", "no inline display");
    send("closed");
    assert.equal(hidden("d"), true, "closed: hidden restored");
    assert.equal(d.style.display, "");
    assert.equal(d.hasAttribute("data-ph-was-hidden"), false);
  });

  it("a popover that was never `hidden` is left alone on close", () => {
    resetDom('<div id="d" popover="manual"></div>');
    const d = document.getElementById("d")!;
    stops.push(show.init(document));
    for (const newState of ["open", "closed"]) {
      const e = new Event("beforetoggle", { bubbles: true }) as Event & { newState?: string };
      e.newState = newState;
      d.dispatchEvent(e);
    }
    assert.equal(hidden("d"), false);
  });

  it("site CSS: the drawer/overlay layout rules sit in a layer so a responsive `lg:hidden` utility beats them", () => {
    const css = readFileSync(new URL("../../dev-server/src/site-tailwind.css", import.meta.url), "utf8");
    const unlayered = css.split("\n").filter((l) => /^\.ph-(drawer|overlay)/.test(l));
    assert.deepEqual(unlayered, [], "no top-level .ph-drawer/.ph-overlay display rule");
    assert.match(css, /@layer components \{\s*\.ph-overlay/);
    assert.doesNotMatch(css, /\[popover\]\.hidden:popover-open/);
  });
});
