import { resetDom } from "../setup.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import * as fitText from "../../src/chunks/fit-text.ts";
import { get, set, subscribe, test as cond } from "../../src/state-store.ts";
import { motion, q, w } from "./chunkHarness.ts";

beforeEach(() => motion(false));

describe("fit-text", () => {
  // happy-dom has no layout: text "width" is 10px per px of font-size, box is 200 wide.
  const layout = (el: HTMLElement, boxW: number | (() => number), boxH = 1000) => {
    const size = () => parseFloat(el.style.fontSize || "16");
    const def = (k: string, get: () => number) => Object.defineProperty(el, k, { get, configurable: true });
    def("scrollWidth", () => size() * 10);
    def("clientWidth", () => (typeof boxW === "function" ? boxW() : boxW));
    def("scrollHeight", () => size() * 2);
    def("clientHeight", () => boxH);
    def("offsetHeight", () => size() * 2);
  };
  const noRO = () => { w.ResizeObserver = undefined; };
  it("oneline: the largest size whose width fits", () => {
    noRO();
    resetDom('<h1 data-fit-text="oneline">Hello</h1>');
    layout(q("h1"), 200);
    fitText.mount(q("h1"));
    assert.ok(Math.abs(parseFloat(q("h1").style.fontSize) - 20) <= 0.5);
    assert.equal(q("h1").style.whiteSpace, "nowrap");
  });
  it("boxoneline also respects the height", () => {
    noRO();
    resetDom('<h1 data-fit-text="boxoneline">Hello</h1>');
    layout(q("h1"), 200, 30);
    fitText.mount(q("h1"));
    assert.ok(Math.abs(parseFloat(q("h1").style.fontSize) - 15) <= 0.5);
  });
  it("multiline / box wrap and do not force nowrap; min and max bound the search", () => {
    noRO();
    resetDom('<p data-fit-text="box" data-fit-max="12">Hi</p>');
    layout(q("p"), 200, 1000);
    fitText.mount(q("p"));
    assert.equal(q("p").style.whiteSpace, "");
    assert.ok(parseFloat(q("p").style.fontSize) <= 12);
    resetDom('<p data-fit-text="multiline">Hi</p>');
    layout(q("p"), 200);
    fitText.mount(q("p"));
    assert.ok(parseFloat(q("p").style.fontSize) > 4);
  });
  it("re-fits when the container resizes", () => {
    resetDom('<div><h1 data-fit-text="oneline">Hello</h1></div>');
    let width = 200;
    const h = q("h1");
    layout(h, () => width);
    let cb: () => void = () => {};
    w.ResizeObserver = class { constructor(f: () => void) { cb = f; } observe() {} };
    w.requestAnimationFrame = (f: () => void) => (f(), 1);
    fitText.mount(h);
    width = 400;
    cb();
    assert.ok(Math.abs(parseFloat(h.style.fontSize) - 40) <= 0.5);
  });
});
