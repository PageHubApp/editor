import { fire, resetDom } from "../setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as state from "../../src/chunks/state.ts";
import { test as cond } from "../../src/state-store.ts";
import { mountAll, q } from "./chunkHarness.ts";

/**
 * `form-field` visibility conditions: `data-state-show` over a `field:<name>` key, the form control's live value. The
 * converter (pagehub.dev conditions.ts) and the editor's condition builder both write this form.
 */
describe("field: gates", () => {
  it("shows a node while another field holds a value, and follows the visitor's typing", () => {
    resetDom(`<input name="company"><p id="t" data-state-show="field:company">Company size?</p>`);
    mountAll(state, "[data-state-show]");
    assert.equal(q("#t").hidden, true);
    const input = q('input[name="company"]') as HTMLInputElement;
    input.value = "Acme";
    fire(input, "input");
    assert.equal(q("#t").hidden, false);
    input.value = "";
    fire(input, "input");
    assert.equal(q("#t").hidden, true);
  });

  it("compares a select's choice, and a checkbox only counts while ticked", () => {
    resetDom(
      `<select name="topic"><option value="">-</option><option value="sales">Sales</option></select>` +
        `<input type="checkbox" name="agree" value="yes">` +
        `<p id="s" data-state-show="field:topic=sales">Sales</p><p id="a" data-state-show="field:agree=yes">Thanks</p>`,
    );
    mountAll(state, "[data-state-show]");
    assert.equal(q("#s").hidden, true);
    const sel = q("select") as HTMLSelectElement;
    sel.value = "sales";
    fire(sel, "change");
    assert.equal(q("#s").hidden, false);
    assert.equal(q("#a").hidden, true);
    const box = q('input[type="checkbox"]') as HTMLInputElement;
    box.checked = true;
    fire(box, "change");
    assert.equal(q("#a").hidden, false);
  });

  it("contains and doesn't contain; a radio group is its ticked option", () => {
    resetDom(`<input name="msg" value="need a quote"><input type="radio" name="plan" value="a"><input type="radio" name="plan" value="b" checked><p data-state-show="field:msg"></p>`);
    mountAll(state, "[data-state-show]"); // a field gate on the page installs the reader
    assert.equal(cond("field:msg*=quote"), true);
    assert.equal(cond("!field:msg*=quote"), false);
    assert.equal(cond("!field:msg*=refund"), true);
    assert.equal(cond("field:plan=b"), true);
    assert.equal(cond("field:missing"), false);
  });
});
