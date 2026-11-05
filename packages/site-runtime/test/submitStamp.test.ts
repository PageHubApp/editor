import { fire, resetDom } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { start } from "../src/core.ts";
import { needsRuntime } from "../src/selector.ts";

const cfg = { chunkBase: "https://cdn.test/c/" };
let stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((f) => f()));
const FORM = '<form method="post" data-form-id="f0123456789ab"><input name="email"></form>';
const stamp = (form: Element) => form.querySelectorAll<HTMLInputElement>('input[name="_ph_t"]');

describe("submit stamp", () => {
  it("adds how long the page has been open, once, to a PageHub form only", () => {
    resetDom('<form id="plain"><input name="q"></form>' + FORM);
    stops.push(start(document, cfg));
    fire(document.getElementById("plain")!, "submit");
    assert.equal(document.querySelectorAll('input[name="_ph_t"]').length, 0);
    const form = document.querySelector("form[data-form-id]")!;
    assert.equal(stamp(form).length, 0, "not in the page before a submit");
    fire(form, "submit");
    fire(form, "submit");
    assert.equal(stamp(form).length, 1);
    assert.match(stamp(form)[0]!.value, /^\d+$/);
  });

  it("stays off in the editing canvas", () => {
    resetDom(FORM);
    document.documentElement.setAttribute("data-ph-edit", "");
    stops.push(start(document, cfg));
    const form = document.querySelector("form")!;
    fire(form, "submit");
    document.documentElement.removeAttribute("data-ph-edit");
    assert.equal(stamp(form).length, 0);
  });

  it("a page whose only runtime use is a PageHub form still loads the runtime", () => {
    assert.equal(needsRuntime(FORM), true);
    assert.equal(needsRuntime('<form method="get"><input name="q"></form>'), false);
  });
});
