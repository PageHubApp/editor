import { fire, resetDom, tick } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import * as on from "../../src/chunks/on.ts";
import * as overflow from "../../src/chunks/overflow.ts";
import { motion, q, w } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("overflow", () => {
  it("drag-scroll moves scrollLeft with the pointer and ends on pointerup", () => {
    resetDom("<div id=o data-drag-scroll><b>x</b></div>");
    overflow.mount(q("#o"));
    const ev = (t: string, x: number, o: any = {}) => Object.assign(new Event(t, { bubbles: true, cancelable: true }), { clientX: x, button: 0, ...o });
    q("b").dispatchEvent(ev("pointerdown", 100));
    window.dispatchEvent(ev("pointermove", 60));
    assert.equal(q("#o").scrollLeft, 40);
    assert.ok(q("#o").hasAttribute("data-dragging"));
    window.dispatchEvent(ev("pointerup", 60));
    window.dispatchEvent(ev("pointermove", 0));
    assert.equal(q("#o").scrollLeft, 40);
    assert.ok(!q("#o").hasAttribute("data-dragging"));
  });
  it("wheel-horizontal turns vertical wheel into sideways scroll", () => {
    resetDom("<div id=o data-wheel-horizontal></div>");
    const o = q("#o");
    Object.defineProperty(o, "scrollWidth", { value: 1000 });
    Object.defineProperty(o, "clientWidth", { value: 200 });
    overflow.mount(o);
    const e = Object.assign(new Event("wheel", { cancelable: true, bubbles: true }), { deltaY: 50, deltaX: 0 });
    o.dispatchEvent(e);
    assert.equal(o.scrollLeft, 50);
    assert.ok(e.defaultPrevented);
  });
  it("wheel-horizontal lets the page scroll when there is nothing to pan", () => {
    resetDom("<div id=o data-wheel-horizontal></div>");
    overflow.mount(q("#o"));
    const e = Object.assign(new Event("wheel", { cancelable: true }), { deltaY: 50, deltaX: 0 });
    q("#o").dispatchEvent(e);
    assert.ok(!e.defaultPrevented);
  });
  it("scrollbar-autohide sets data-scrolling, then clears it after the delay", () => {
    resetDom('<div id=o data-scrollbar-autohide="1500ms"></div>');
    mock.timers.enable({ apis: ["setTimeout"] });
    overflow.mount(q("#o"));
    fire(q("#o"), "scroll");
    assert.ok(q("#o").hasAttribute("data-scrolling"));
    mock.timers.tick(1499);
    assert.ok(q("#o").hasAttribute("data-scrolling"));
    mock.timers.tick(1);
    mock.timers.reset();
    assert.ok(!q("#o").hasAttribute("data-scrolling"));
  });
  it("smoothing eases the wheel toward the target over frames", () => {
    resetDom("<div id=o data-scroll-smoothing=0.5></div>");
    const o = q("#o");
    Object.defineProperty(o, "scrollHeight", { value: 1000 });
    Object.defineProperty(o, "clientHeight", { value: 200 });
    const frames: (() => void)[] = [];
    w.requestAnimationFrame = (f: () => void) => frames.push(f);
    overflow.mount(o);
    o.dispatchEvent(Object.assign(new Event("wheel", { cancelable: true }), { deltaY: 100, deltaX: 0 }));
    assert.equal(o.scrollTop, 0);
    frames.shift()!();
    assert.equal(o.scrollTop, 50);
  });
});
