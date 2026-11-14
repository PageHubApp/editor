import { fire, resetDom } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { start } from "../src/core.ts";
import { unlockSubmits } from "../src/core/nativePost.ts";

const cfg = { chunkBase: "https://cdn.test/c/" };
let stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((f) => f());
  document.documentElement.removeAttribute("data-ph-edit");
  history.replaceState(null, "", "/");
});

/** Count the submits that went on to the browser (not prevented). */
function sent(form: Element, times: number) {
  let n = 0;
  const count = (e: Event) => void (!e.defaultPrevented && n++);
  document.addEventListener("submit", count);
  for (let i = 0; i < times; i++) fire(form, "submit");
  document.removeEventListener("submit", count);
  return n;
}

describe("native post: one submit at a time", () => {
  it("a second submit while the first is on its way is dropped", () => {
    resetDom('<form method="post" data-form-id="f0123456789ab"><button>Send</button></form>');
    stops.push(start(document, cfg));
    const form = document.querySelector("form")!;
    assert.equal(sent(form, 3), 1);
    assert.equal(form.getAttribute("aria-busy"), "true");
  });

  it("a page back from the back/forward cache takes a submit again", () => {
    resetDom('<form method="post" data-form-id="f0123456789ab"></form>');
    stops.push(start(document, cfg));
    const form = document.querySelector("form")!;
    sent(form, 1);
    unlockSubmits(document);
    assert.equal(sent(form, 1), 1);
  });

  it("leaves alone a submit something else handled, a plain form, and the editing canvas", () => {
    resetDom('<form id="plain" method="get"></form><form id="ph" method="post" data-form-id="f0123456789ab"></form>');
    stops.push(start(document, cfg));
    const plain = document.getElementById("plain")!;
    assert.equal(sent(plain, 2), 2);
    const ph = document.getElementById("ph")!;
    ph.addEventListener("submit", (e) => e.preventDefault());
    fire(ph, "submit");
    assert.ok(!ph.hasAttribute("aria-busy"), "the fetch path or site JS owns it");

    stops.splice(0).forEach((f) => f());
    resetDom('<form method="post" data-form-id="f0123456789ab"></form>');
    document.documentElement.setAttribute("data-ph-edit", "");
    stops.push(start(document, cfg));
    fire(document.querySelector("form")!, "submit");
    assert.ok(!document.querySelector("form")!.hasAttribute("aria-busy"));
  });
});

describe("native post: the answer is shown", () => {
  it("opens the closed dialog holding the posted form", () => {
    resetDom('<dialog id="consult"><form method="post" data-form-id="f0123456789ab" data-form-posted id="f0123456789ab"><p>Thanks</p></form></dialog>');
    stops.push(start(document, cfg));
    assert.equal(document.querySelector("dialog")!.open, true);
  });

  it("of two copies, opens the one the #anchor names", () => {
    history.replaceState(null, "", "/?_ph_form=f0123456789ab#f0123456789ab-2");
    resetDom(
      '<dialog id="a"><form data-form-id="f0123456789ab" data-form-posted id="f0123456789ab"></form></dialog>' +
        '<details id="b"><summary>Quote</summary><form data-form-id="f0123456789ab" data-form-posted id="f0123456789ab-2"></form></details>',
    );
    stops.push(start(document, cfg));
    assert.equal((document.getElementById("a") as HTMLDialogElement).open, false);
    assert.equal((document.getElementById("b") as HTMLDetailsElement).open, true);
  });

  it("opens nothing on an ordinary page or in the editing canvas", () => {
    resetDom('<dialog><form data-form-id="f0123456789ab"></form></dialog>');
    stops.push(start(document, cfg));
    assert.equal(document.querySelector("dialog")!.open, false);

    stops.splice(0).forEach((f) => f());
    resetDom('<dialog><form data-form-id="f0123456789ab" data-form-posted></form></dialog>');
    document.documentElement.setAttribute("data-ph-edit", "");
    stops.push(start(document, cfg));
    assert.equal(document.querySelector("dialog")!.open, false);
  });
});
