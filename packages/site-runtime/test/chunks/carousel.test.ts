import { fire, resetDom } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import * as carousel from "../../src/chunks/carousel.ts";
import * as on from "../../src/chunks/on.ts";
import { motion, q } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("carousel", () => {
  const html = '<div id=t data-carousel="dots arrows"><i></i><i></i><i></i></div>';
  const stub = () =>
    [...document.querySelectorAll("#t > i")].forEach((s, i) => Object.defineProperty(s, "offsetLeft", { value: i * 100 }));
  it("builds arrows and one dot per slide, and navigates", () => {
    resetDom(html);
    stub();
    const to = mock.fn();
    (q("#t") as any).scrollTo = to;
    carousel.mount(q("#t"));
    assert.equal(document.querySelectorAll("[data-carousel-dot]").length, 3);
    assert.equal(document.querySelectorAll("[data-carousel-dots] [data-carousel-dot][aria-current]").length, 1);
    fire(q("[data-carousel-next]"), "click");
    assert.equal(to.mock.calls[0]!.arguments[0].left, 100);
    fire(document.querySelectorAll("[data-carousel-dot]")[2]!, "click");
    assert.equal(to.mock.calls[1]!.arguments[0].left, 200);
  });
  it("marks the current dot on scroll; arrows-only adds no dots", () => {
    resetDom(html);
    stub();
    carousel.mount(q("#t"));
    q("#t").scrollLeft = 200;
    fire(q("#t"), "scroll");
    assert.equal(document.querySelectorAll("[data-carousel-dot]")[2]!.getAttribute("aria-current"), "true");
    resetDom('<div id=t data-carousel="arrows"><i></i></div>');
    carousel.mount(q("#t"));
    assert.equal(document.querySelectorAll("[data-carousel-dot]").length, 0);
    assert.equal(document.querySelectorAll("[data-carousel-prev]").length, 1);
  });
  it("clamps at the ends without wrap, loops with wrap", () => {
    for (const [attr, nextFromLast, prevFromFirst] of [["dots arrows", 200, 0], ["dots arrows wrap", 0, 200]] as const) {
      resetDom(`<div id=t data-carousel="${attr}"><i></i><i></i><i></i></div>`);
      stub();
      const to = mock.fn();
      (q("#t") as any).scrollTo = to;
      carousel.mount(q("#t"));
      q("#t").scrollLeft = 200;
      fire(q("[data-carousel-next]"), "click");
      assert.equal(to.mock.calls[0]!.arguments[0].left, nextFromLast, `${attr} next`);
      q("#t").scrollLeft = 0;
      fire(q("[data-carousel-prev]"), "click");
      assert.equal(to.mock.calls[1]!.arguments[0].left, prevFromFirst, `${attr} prev`);
    }
  });
  it("wires controls the author placed in the parent and builds none for a bare wrap token", () => {
    resetDom(
      '<div id=r><div id=t data-carousel="wrap"><i></i><i></i><i></i></div><button data-carousel-prev></button><button data-carousel-next></button><b data-carousel-dot></b><b data-carousel-dot></b><b data-carousel-dot></b></div>',
    );
    stub();
    const to = mock.fn();
    (q("#t") as any).scrollTo = to;
    carousel.mount(q("#t"));
    assert.equal(document.querySelectorAll("[data-carousel-nav]").length, 0);
    fire(q("[data-carousel-next]"), "click");
    assert.equal(to.mock.calls[0]!.arguments[0].left, 100);
    fire(q("[data-carousel-prev]"), "click");
    assert.equal(to.mock.calls[1]!.arguments[0].left, 200);
    q("#t").scrollLeft = 100;
    fire(q("#t"), "scroll");
    assert.equal(document.querySelectorAll("b[aria-current=true]").length, 1);
    assert.equal(document.querySelectorAll("b")[1]!.getAttribute("aria-current"), "true");
    fire(document.querySelectorAll("b")[2]!, "click");
    assert.equal(to.mock.calls[2]!.arguments[0].left, 200);
  });
  it("the built nav is labelled, ordered prev / dots / next, and carries one default stylesheet", () => {
    resetDom(html);
    stub();
    carousel.mount(q("#t"));
    const nav = q("[data-carousel-nav]");
    assert.deepEqual([...nav.children].map(c => c.getAttribute("data-carousel-prev") !== null ? "prev" : c.getAttribute("data-carousel-next") !== null ? "next" : "dots"), ["prev", "dots", "next"]);
    assert.equal(q("[data-carousel-prev]").getAttribute("aria-label"), "Previous slide");
    assert.equal(q("[data-carousel-next]").getAttribute("aria-label"), "Next slide");
    assert.equal(q("[data-carousel-prev] svg").getAttribute("aria-hidden"), "true", "the arrow icon is decoration");
    assert.deepEqual([...document.querySelectorAll("[data-carousel-dot]")].map(d => d.getAttribute("aria-label")), ["Go to slide 1", "Go to slide 2", "Go to slide 3"]);
    const css = q("#ph-carousel-style").textContent!;
    assert.match(css, /\[data-carousel-dot\]\[aria-current="true"\]/, "the active dot is styled from aria-current");
    assert.ok(css.includes("--color-primary"), "theme tokens, not literal colours");
    for (const rule of css.split("\n").filter(r => !r.startsWith("@media"))) assert.ok(rule.startsWith(":where([data-carousel-nav])"), `rule is scoped by a zero-specificity nav selector: ${rule.slice(0, 60)}`);
    resetDom('<div id=a data-carousel="dots"><i></i></div><div id=b data-carousel="arrows"><i></i></div>');
    carousel.mount(q("#a"));
    carousel.mount(q("#b"));
    assert.equal(document.querySelectorAll("#ph-carousel-style").length, 1, "one stylesheet however many carousels");
  });
  it("styles nothing when the author placed every control", () => {
    resetDom('<div id=r><div id=t data-carousel="wrap"><i></i></div><button data-carousel-prev></button></div>');
    carousel.mount(q("#t"));
    assert.equal(document.querySelectorAll("#ph-carousel-style").length, 0);
  });
  it("reduced motion scrolls without smooth behaviour", () => {
    motion(true);
    resetDom(html);
    stub();
    const to = mock.fn();
    (q("#t") as any).scrollTo = to;
    carousel.mount(q("#t"));
    fire(q("[data-carousel-next]"), "click");
    assert.equal(to.mock.calls[0]!.arguments[0].behavior, "auto");
  });
  it("overlay lays the controls over the track's box and positions a static parent", () => {
    resetDom('<section id=p><h2>Title</h2><div id=t data-carousel="dots arrows overlay"><i></i><i></i></div></section>');
    for (const [k, v] of Object.entries({ offsetTop: 40, offsetLeft: 0, offsetWidth: 800, offsetHeight: 500 })) Object.defineProperty(q("#t"), k, { value: v });
    carousel.mount(q("#t"));
    const nav = q("[data-carousel-nav]") as HTMLElement;
    assert.ok(nav.hasAttribute("data-carousel-overlay"));
    assert.equal((q("#p") as HTMLElement).style.position, "relative");
    assert.deepEqual([nav.style.top, nav.style.width, nav.style.height], ["40px", "800px", "500px"]);
    resetDom('<div id=t data-carousel="dots"><i></i><i></i></div>');
    carousel.mount(q("#t"));
    assert.ok(!q("[data-carousel-nav]").hasAttribute("data-carousel-overlay"), "a bar under the track by default");
  });
});
