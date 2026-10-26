import { fire, resetDom } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { start } from "../src/core.ts";

const cfg = { chunkBase: "https://cdn.test/c/" };
let stops: (() => void)[] = [];
const go = () => void stops.push(start(document, cfg));
const visit = (url: string) => (window as any).happyDOM.setURL(url);
const FORM = '<form method="post" data-form-id="f0123456789ab"><input name="email"></form>';

beforeEach(() => {
  sessionStorage.clear();
  visit("https://example.test/");
});
afterEach(() => stops.splice(0).forEach((f) => f()));

describe("attribution", () => {
  it("remembers the first page of the session and posts it with a form on a later page", () => {
    visit("https://example.test/?utm_source=google&utm_campaign=test&gclid=abc");
    resetDom("<p>landing</p>");
    go();
    stops.splice(0).forEach((f) => f());

    visit("https://example.test/contact?utm_source=other");
    resetDom(FORM);
    go();
    const form = document.querySelector("form")!;
    fire(form, "submit");
    const posted = JSON.parse((form.querySelector('input[name="_ph_attribution"]') as HTMLInputElement).value);
    assert.equal(posted.utm_source, "google");
    assert.equal(posted.utm_campaign, "test");
    assert.equal(posted.gclid, "abc");
    assert.equal(posted.landingPath, "/?utm_source=google&utm_campaign=test&gclid=abc");
  });

  it("does not touch a form that is not a PageHub form, and adds one field only", () => {
    visit("https://example.test/?utm_source=google");
    resetDom('<form id="plain"><input name="q"></form>' + FORM);
    go();
    fire(document.getElementById("plain")!, "submit");
    assert.equal(document.querySelectorAll('input[name="_ph_attribution"]').length, 0);
    const form = document.querySelector("form[data-form-id]")!;
    fire(form, "submit");
    fire(form, "submit");
    assert.equal(form.querySelectorAll('input[name="_ph_attribution"]').length, 1);
  });

  it("caps long values at 200 characters", () => {
    visit("https://example.test/?utm_source=" + "x".repeat(500));
    resetDom(FORM);
    go();
    const form = document.querySelector("form")!;
    fire(form, "submit");
    const posted = JSON.parse((form.querySelector('input[name="_ph_attribution"]') as HTMLInputElement).value);
    assert.equal(posted.utm_source.length, 200);
  });

  it("stays off in the editing canvas", () => {
    visit("https://example.test/?utm_source=google");
    resetDom(FORM);
    document.documentElement.setAttribute("data-ph-edit", "");
    go();
    assert.equal(sessionStorage.getItem("ph_attribution"), null);
    document.documentElement.removeAttribute("data-ph-edit");
  });
});
