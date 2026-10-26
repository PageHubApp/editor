import { fire, resetDom } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import * as actions from "../../src/chunks/actions.ts";
import * as lightbox from "../../src/chunks/lightbox.ts";
import { mountAll, motion, q } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("actions: data-close-link", () => {
  it("closes a popover when a link inside is clicked, not when other content is", () => {
    resetDom('<div id=d popover=manual data-close-link="a"><a id=l href="/x">x</a><p id=p>y</p></div>');
    const d = q("#d") as any;
    d.matches = (s: string) => (s === ":popover-open" ? true : Element.prototype.matches.call(d, s));
    d.hidePopover = mock.fn();
    mountAll(actions, "[data-close-link]");
    fire(q("#p"), "click");
    assert.equal(d.hidePopover.mock.callCount(), 0);
    fire(q("#l"), "click");
    assert.equal(d.hidePopover.mock.callCount(), 1);
  });
  it("closes a dialog, and adds hidden to a plain element", () => {
    resetDom('<dialog id=d data-close-link="a"><a id=l href="/x">x</a></dialog><div id=h data-close-link="a, button"><a id=m href="/y">y</a><button id=bb>b</button></div>');
    const d = q("#d") as any;
    d.close = mock.fn();
    mountAll(actions, "[data-close-link]");
    fire(q("#l"), "click");
    assert.equal(d.close.mock.callCount(), 1);
    fire(q("#m"), "click");
    assert.ok(q("#h").classList.contains("hidden"));
    q("#h").classList.remove("hidden");
    fire(q("#bb"), "click");
    assert.ok(q("#h").classList.contains("hidden"), "the selector can name buttons too");
  });
});

describe("actions: print, scroll, field, key, tabs", () => {
  it("prints the page, or marks the scoped ancestor for the print and clears it after", () => {
    resetDom('<div id=c data-coupon><button id=b data-print="[data-coupon]">p</button></div><button id=a data-print="page">p</button>');
    const print = mock.fn();
    (window as any).print = print;
    mountAll(actions, "[data-print]");
    fire(q("#a"), "click");
    assert.equal(print.mock.callCount(), 1);
    assert.ok(!q("#c").classList.contains("ph-print"));
    fire(q("#b"), "click");
    assert.equal(print.mock.callCount(), 2);
    assert.ok(q("#c").classList.contains("ph-print"));
    fire(window as any, "afterprint");
    assert.ok(!q("#c").classList.contains("ph-print"));
  });
  it("scrolls the named element by its own width, either way", () => {
    resetDom('<button id=p data-scroll-by=t data-scroll-step="-1">p</button><button id=n data-scroll-by=t data-scroll-step="1">n</button><div id=t></div>');
    const t = q("#t") as any;
    Object.defineProperty(t, "clientWidth", { value: 300 });
    t.scrollBy = mock.fn();
    mountAll(actions, "[data-scroll-by]");
    fire(q("#p"), "click");
    fire(q("#n"), "click");
    assert.deepEqual(t.scrollBy.mock.calls.map((c: any) => c.arguments[0].left), [-300, 300]);
    assert.equal(t.scrollBy.mock.calls[0].arguments[0].behavior, "smooth");
  });
  it("sets a field by selector and fires input and change", () => {
    resetDom('<a id=a href="#f" data-set-field="select[name=pos]" data-set-value="sales">go</a><select name=pos><option value=""></option><option value=sales>S</option></select>');
    const seen: string[] = [];
    for (const type of ["input", "change"]) q("select").addEventListener(type, () => seen.push(type));
    mountAll(actions, "[data-set-field]");
    fire(q("#a"), "click");
    assert.equal((q("select") as HTMLSelectElement).value, "sales");
    assert.deepEqual(seen, ["input", "change"]);
  });
  it("Enter and Space click the element; other keys and keys from inside do not", () => {
    resetDom("<div id=d role=button tabindex=0 data-key-click><input id=i></div>");
    const click = mock.fn();
    q("#d").addEventListener("click", click);
    mountAll(actions, "[data-key-click]");
    const key = (el: Element, k: string) => {
      const e = new (window as any).KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    assert.equal(key(q("#d"), "Enter"), true);
    assert.equal(key(q("#d"), " "), true);
    assert.equal(key(q("#d"), "a"), false);
    assert.equal(key(q("#i"), "Enter"), false);
    assert.equal(click.mock.callCount(), 2);
  });
  it("a tab with aria-expanded marks itself open and the rest of its group closed", () => {
    resetDom('<button id=a data-tab-target=p1 data-tab-of=g aria-expanded=true></button><button id=b data-tab-target=p2 data-tab-of=g aria-expanded=false></button><button id=o data-tab-target=p3 data-tab-of=h aria-expanded=true></button><button id=n data-tab-target=p4 data-tab-of=g></button>');
    mountAll(actions, "[data-tab-target]");
    fire(q("#b"), "click");
    assert.equal(q("#a").getAttribute("aria-expanded"), "false");
    assert.equal(q("#b").getAttribute("aria-expanded"), "true");
    assert.equal(q("#o").getAttribute("aria-expanded"), "true");
    assert.equal(q("#n").hasAttribute("aria-expanded"), false);
  });
});

describe("lightbox", () => {
  const html = `<div id=grid><div id=t0 data-lightbox=v data-lightbox-caption=cap><img src="https://imagedelivery.net/h/id0/w=400" alt="One"></div><div id=skip></div><div id=t1 data-lightbox=v data-lightbox-caption=cap><img src="https://x.test/b.jpg" alt="Two"></div><div id=t2 data-lightbox=v data-lightbox-caption=cap><img src="https://x.test/c.jpg" alt="Three"></div></div>
    <div id=v data-idx=0><img srcset="a 1x" sizes="1px" src="" alt=""><p id=cap></p><button id=prev data-lightbox=v data-lightbox-step="-1" data-lightbox-grid=grid data-lightbox-caption=cap></button><button id=next data-lightbox=v data-lightbox-step="1" data-lightbox-grid=grid data-lightbox-caption=cap></button></div>`;
  const img = () => q("#v img") as HTMLImageElement;
  it("a tile click fills the overlay: src (CDN variant widened), alt, caption, index", () => {
    resetDom(html);
    mountAll(lightbox, "[data-lightbox]");
    fire(q("#t1"), "click");
    assert.equal(img().getAttribute("src"), "https://x.test/b.jpg");
    assert.equal(img().alt, "Two");
    assert.equal(q("#cap").textContent, "Two");
    assert.equal(q("#v").getAttribute("data-idx"), "1");
    assert.equal(img().hasAttribute("srcset"), false);
    fire(q("#t0"), "click");
    assert.equal(img().getAttribute("src"), "https://imagedelivery.net/h/id0/w=1600");
  });
  it("prev and next walk the photo tiles and wrap", () => {
    resetDom(html);
    mountAll(lightbox, "[data-lightbox]");
    fire(q("#t0"), "click");
    fire(q("#prev"), "click");
    assert.equal(q("#v").getAttribute("data-idx"), "2");
    assert.equal(img().alt, "Three");
    fire(q("#next"), "click");
    assert.equal(q("#v").getAttribute("data-idx"), "0");
    assert.equal(q("#cap").textContent, "One");
    fire(q("#next"), "click");
    assert.equal(img().alt, "Two");
  });
});
