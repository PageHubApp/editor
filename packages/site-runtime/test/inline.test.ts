import { fire, resetDom, tick } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setChunkLoader } from "../src/chunks.ts";
import { start } from "../src/core.ts";
import { DISMISS_SNIPPET } from "../src/head/dismiss.ts";
import { THEME_SNIPPET } from "../src/head/theme.ts";
import { parseDuration } from "../src/duration.ts";

setChunkLoader(async () => ({}));
const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((f) => f()));
const boot = (html: string) => {
  resetDom(html);
  stops.push(start(document, { chunkBase: "/c/" }));
};

describe("autosubmit", () => {
  it("change submits a GET form once; no loop on identical values", () => {
    boot('<form method="get" data-autosubmit><select name="s"><option value="a">a</option><option value="b">b</option></select></form>');
    const form = document.querySelector("form")!;
    const spy = mock.fn();
    form.requestSubmit = spy as never;
    const sel = form.querySelector("select")!;
    sel.value = "b";
    fire(sel, "change");
    fire(sel, "change");
    assert.equal(spy.mock.callCount(), 1);
  });

  it("300ms debounces typing, change flushes without a double submit", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      boot('<form data-autosubmit="300ms"><input name="q"></form>');
      const form = document.querySelector("form")!;
      const spy = mock.fn();
      form.requestSubmit = spy as never;
      const input = form.querySelector("input")!;
      input.value = "a";
      fire(input, "input");
      mock.timers.tick(200);
      input.value = "ab";
      fire(input, "input");
      mock.timers.tick(299);
      assert.equal(spy.mock.callCount(), 0);
      mock.timers.tick(1);
      assert.equal(spy.mock.callCount(), 1);
      fire(input, "change");
      assert.equal(spy.mock.callCount(), 1);
    } finally {
      mock.timers.reset();
    }
  });

  it("ignores forms without the attribute", () => {
    boot('<form><input name="q"></form>');
    const form = document.querySelector("form")!;
    const spy = mock.fn();
    form.requestSubmit = spy as never;
    fire(form.querySelector("input")!, "change");
    assert.equal(spy.mock.callCount(), 0);
  });
});

describe("copy", () => {
  it("writes the value and flags data-copied for 2s", async () => {
    const writeText = mock.fn(async (_t: string) => {});
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    boot('<button data-copy="SAVE10">Copy</button>');
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const b = document.querySelector("button")!;
      fire(b, "click");
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(writeText.mock.calls[0]!.arguments[0], "SAVE10");
      assert.ok(b.hasAttribute("data-copied"));
      mock.timers.tick(2000);
      assert.ok(!b.hasAttribute("data-copied"));
    } finally {
      mock.timers.reset();
    }
  });
});

describe("dismiss", () => {
  const html = '<div id="b" data-dismiss="cookie-ok"><button data-dismiss-close>x</button></div>';
  it("click hides and stores", () => {
    boot(html);
    fire(document.querySelector("button")!, "click");
    assert.equal(document.getElementById("b")!.style.display, "none");
    assert.equal(localStorage.getItem("ph-dismiss:cookie-ok"), "1");
  });
  it("hides a remembered one on load", () => {
    localStorage.setItem("ph-dismiss:cookie-ok", "1");
    resetDom(html);
    localStorage.setItem("ph-dismiss:cookie-ok", "1");
    stops.push(start(document, { chunkBase: "/c/" }));
    assert.equal(document.getElementById("b")!.style.display, "none");
  });
  it("head snippet hides stored keys before paint", () => {
    resetDom(html);
    localStorage.setItem("ph-dismiss:cookie-ok", "1");
    new Function(DISMISS_SNIPPET)();
    assert.match(document.head.querySelector("style")!.textContent!, /\[data-dismiss="cookie-ok"\]\{display:none!important\}/);
  });
  it("storage throwing still hides for the session", () => {
    boot('<div id="b2" data-dismiss="k2"><button data-dismiss-close>x</button></div>');
    const orig = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { get: () => { throw new Error("denied"); }, configurable: true });
    try {
      fire(document.querySelector("#b2 button")!, "click");
      assert.equal(document.getElementById("b2")!.style.display, "none");
    } finally {
      Object.defineProperty(window, "localStorage", orig);
    }
  });
});

describe("theme toggle", () => {
  it("toggles data-theme and persists", () => {
    boot('<button data-theme-toggle>t</button>');
    document.documentElement.setAttribute("data-theme", "light");
    const b = document.querySelector("button")!;
    fire(b, "click");
    assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
    assert.equal(localStorage.getItem("ph-theme"), "dark");
    fire(b, "click");
    assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  });
  it("head snippet applies the stored theme, else the OS preference", () => {
    resetDom();
    localStorage.setItem("ph-theme", "dark");
    new Function(THEME_SNIPPET)();
    assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
    localStorage.clear();
    window.matchMedia = (() => ({ matches: true })) as never;
    new Function(THEME_SNIPPET)();
    assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
    window.matchMedia = (() => ({ matches: false })) as never;
    new Function(THEME_SNIPPET)();
    assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  });
});

describe("closedby fallback", () => {
  it("backdrop click closes, inside click does not", () => {
    boot('<dialog closedby="any" open><p>hi</p></dialog>');
    const d = document.querySelector("dialog")!;
    d.getBoundingClientRect = () => ({ left: 10, right: 110, top: 10, bottom: 110 }) as DOMRect;
    delete (window.HTMLDialogElement?.prototype as any)?.closedBy;
    d.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 50 }));
    assert.ok(d.open);
    d.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 50 }));
    assert.ok(!d.open);
  });
});

describe("duration", () => {
  it("parses units", () => {
    assert.equal(parseDuration("300ms", 0), 300);
    assert.equal(parseDuration("5s", 0), 5000);
    assert.equal(parseDuration("1.5s", 0), 1500);
    assert.equal(parseDuration("", 7), 7);
    assert.equal(parseDuration("x", 7), 7);
  });
});
void tick;
