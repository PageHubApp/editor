import { fire, resetDom } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import * as scrollEffect from "../../src/chunks/scroll-effect.ts";
import { motion, q, w } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("scroll-effect", () => {
  const html = (attrs: string) => `<section id=s ${attrs}><div id=p><div id=t></div></div></section>`;
  const rect = (top: number, height = 3000) => {
    q("#s").getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} }) as DOMRect;
    w.innerHeight = 1000;
  };
  const geo = () => {
    Object.defineProperty(q("#t"), "scrollWidth", { value: 3000 });
    Object.defineProperty(q("#p"), "clientWidth", { value: 1000 });
  };
  it("pins the section for `runway` screens and pans the track by scroll progress", () => {
    resetDom(html('data-scroll-effect="horizontal" data-scroll-runway="4"'));
    rect(-1000, 4000);
    geo();
    scrollEffect.mount(q("#s"));
    assert.equal(q("#s").style.height, "400vh");
    assert.equal(q("#p").style.position, "sticky");
    // progress = 1000 / (4000-1000) = 1/3; span = 2000
    assert.match(q("#t").style.transform, /translate3d\(-666\.6/);
    rect(-3000, 4000);
    fire(window as any, "scroll");
    assert.match(q("#t").style.transform, /translate3d\(-2000px/);
  });
  it("speed and reverse direction change the pan", () => {
    resetDom(html('data-scroll-effect="horizontal" data-scroll-speed="0.5" data-scroll-direction="reverse"'));
    rect(-3000 + 0, 4000 - 1000);
    rect(-2000, 3000);
    geo();
    scrollEffect.mount(q("#s"));
    assert.match(q("#t").style.transform, /translate3d\(1000px/);
  });
  it("timeline mode writes --scroll-progress", () => {
    resetDom(html('data-scroll-effect="timeline"'));
    rect(-1000, 3000);
    scrollEffect.mount(q("#s"));
    assert.equal(q("#s").style.getPropertyValue("--scroll-progress"), "0.5000");
  });
  it("smoothing lerps toward the target over frames", () => {
    resetDom(html('data-scroll-effect="timeline" data-scroll-smoothing="0.5"'));
    rect(-2000, 3000);
    const frames: (() => void)[] = [];
    w.requestAnimationFrame = (f: () => void) => frames.push(f);
    scrollEffect.mount(q("#s"));
    frames.shift()!();
    assert.equal(q("#s").style.getPropertyValue("--scroll-progress"), "0.5000");
    frames.shift()!();
    assert.equal(q("#s").style.getPropertyValue("--scroll-progress"), "0.7500");
  });
  it("reduced motion: no pin, no transform; the pin scrolls natively", () => {
    motion(true);
    resetDom(html('data-scroll-effect="horizontal"'));
    scrollEffect.mount(q("#s"));
    assert.equal(q("#s").style.height, "");
    assert.equal(q("#p").style.overflowX, "auto");
  });
});
