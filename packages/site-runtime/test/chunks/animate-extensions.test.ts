import { resetDom } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import * as animate from "../../src/chunks/animate.ts";
import * as on from "../../src/chunks/on.ts";
import { FakeIO, motion, mountAll, q, useIO } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("animate extensions", () => {
  it("stagger offsets each child's delay by the step", () => {
    resetDom('<ul data-animate-stagger="80ms"><li data-animate></li><li data-animate></li><li data-animate></li></ul>');
    useIO();
    mountAll(animate, "li");
    assert.deepEqual([...document.querySelectorAll("li")].map((l) => l.style.animationDelay), ["0ms", "80ms", "160ms"]);
  });
  it("stagger accepts seconds", () => {
    resetDom('<ul data-animate-stagger="0.1s"><li data-animate></li><li data-animate></li></ul>');
    useIO();
    mountAll(animate, "li");
    assert.equal(document.querySelectorAll("li")[1]!.style.animationDelay, "100ms");
  });
  it("trigger=load plays immediately", () => {
    resetDom('<div data-animate="fade-up" data-animate-trigger="load"></div>');
    useIO();
    animate.mount(q("div"));
    assert.ok(q("div").classList.contains("animate-css-fade-up"));
    assert.ok(q("div").hasAttribute("data-animated"));
  });
  it("exit plays when the element leaves, and the entrance again on return", () => {
    resetDom('<div data-animate="fade-up" data-animate-exit="fade-out"></div>');
    useIO();
    const el = q("div");
    animate.mount(el);
    const io = FakeIO.ever.find((f) => f.observed.has(el))!;
    const cb = io.cb;
    const ev = (isIntersecting: boolean) => cb([{ target: el, isIntersecting, intersectionRatio: 1 }]);
    ev(false); // never seen yet: no exit
    assert.ok(!el.classList.contains("animate-css-fade-out"));
    ev(true);
    assert.ok(el.classList.contains("animate-css-fade-up"));
    assert.ok(io.observed.has(el));
    ev(false);
    assert.ok(el.classList.contains("animate-css-fade-out") && !el.classList.contains("animate-css-fade-up"));
    ev(true);
    assert.ok(el.classList.contains("animate-css-fade-up") && !el.classList.contains("animate-css-fade-out"));
  });
  it("init leaves what is already on screen as painted, then lets the stylesheet hide the rest", () => {
    resetDom('<div id="top" data-animate="fade-up"></div><div id="below" data-animate="fade-up"></div><div id="hero" data-animate="fade-up" data-animate-trigger="load"></div><div id="closed" data-animate></div>');
    const box = (top: number, height: number) => () => ({ top, bottom: top + height, height, width: 100, left: 0, right: 100, x: 0, y: top, toJSON() {} }) as DOMRect;
    q("#top").getBoundingClientRect = box(100, 200);
    q("#below").getBoundingClientRect = box(window.innerHeight + 400, 200);
    q("#hero").getBoundingClientRect = box(0, 300);
    q("#closed").getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0, width: 0, left: 0, right: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    animate.init(document);
    assert.ok(document.documentElement.hasAttribute("data-animate-ready"));
    assert.ok(q("#top").hasAttribute("data-animated"), "on screen: shown, never hidden");
    assert.ok(!q("#below").hasAttribute("data-animated"), "below the fold: waits to scroll in");
    assert.ok(!q("#hero").hasAttribute("data-animated"), "trigger=load: left for mount to play");
    assert.ok(!q("#closed").hasAttribute("data-animated"), "zero-size (closed dialog): waits");
    useIO();
    animate.mount(q("#top"));
    assert.equal(q("#top").className, "", "an element init showed doesn't replay");
    assert.ok(!FakeIO.ever.some((f) => f.observed.has(q("#top"))));
  });
  it("reduced motion: visible, no exit or entrance class", () => {
    motion(true);
    resetDom('<div data-animate="fade-up" data-animate-exit="fade-out" data-animate-trigger="load"></div>');
    animate.mount(q("div"));
    assert.equal(q("div").className, "");
    assert.ok(q("div").hasAttribute("data-animated"));
  });
});
