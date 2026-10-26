import "../setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetDom } from "../setup.ts";
import * as show from "../../src/chunks/show.ts";

/** The overlay blocks author as `<div id="m" commandfor="m" command="hide-popover" popover="manual">` with a panel inside. */
const PAGE = `<div id="m" class="hidden" commandfor="m" command="hide-popover" popover="manual"><div id="panel"><span id="inner">x</span></div></div>`;

describe("show chunk: a self-commanding overlay closes on its own backdrop", () => {
  let off: (() => void) | void;
  beforeEach(() => {
    resetDom(PAGE);
    const m = document.getElementById("m") as any;
    m.hidePopover = () => m.setAttribute("data-closed", "1");
    m.matches = (s: string) => (s === ":popover-open" ? !m.hasAttribute("data-closed") : Element.prototype.matches.call(m, s));
    off = show.init(document);
  });
  afterEach(() => {
    if (off) off();
  });

  it("a click that lands on the overlay itself hides it", () => {
    document.getElementById("m")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(document.getElementById("m")!.getAttribute("data-closed"), "1");
  });

  it("a click on the panel or inside it does not", () => {
    document.getElementById("panel")!.dispatchEvent(new Event("click", { bubbles: true }));
    document.getElementById("inner")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(document.getElementById("m")!.hasAttribute("data-closed"), false);
  });

  it("is off in the editing canvas", () => {
    document.documentElement.setAttribute("data-ph-edit", "");
    document.getElementById("m")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(document.getElementById("m")!.hasAttribute("data-closed"), false);
    document.documentElement.removeAttribute("data-ph-edit");
  });
});

describe("show chunk: a non-button invoker commands another element", () => {
  let off: (() => void) | void;
  afterEach(() => {
    if (off) off();
  });
  const stub = (id: string) => {
    const t = document.getElementById(id) as any;
    t.showPopover = () => t.setAttribute("data-open", "1");
    t.hidePopover = () => t.removeAttribute("data-open");
    t.matches = (s: string) => (s === ":popover-open" ? t.hasAttribute("data-open") : Element.prototype.matches.call(t, s));
    return t;
  };

  it("a click on a tile, or on something inside it, opens the popover it names", () => {
    resetDom('<div id="tile" commandfor="v" command="show-popover"><img id="photo"></div><div id="v" class="hidden" popover="manual"></div>');
    const v = stub("v");
    off = show.init(document);
    document.getElementById("photo")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(v.getAttribute("data-open"), "1");
    document.getElementById("tile")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(v.getAttribute("data-open"), "1");
  });

  it("toggle-popover toggles, and a button is left to the native invoker", () => {
    resetDom('<div id="d" commandfor="v" command="toggle-popover"></div><button id="b" commandfor="v" command="show-popover"></button><div id="v" popover="manual"></div>');
    const v = stub("v");
    off = show.init(document);
    document.getElementById("d")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(v.getAttribute("data-open"), "1");
    document.getElementById("d")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(v.hasAttribute("data-open"), false);
    document.getElementById("b")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(v.hasAttribute("data-open"), false, "the runtime does not act for a button");
  });

  it("show-modal opens a dialog and close closes it", () => {
    resetDom('<div id="open" commandfor="dlg" command="show-modal"></div><div id="shut" commandfor="dlg" command="close"></div><dialog id="dlg"></dialog>');
    const dlg = document.getElementById("dlg") as any;
    dlg.showModal = () => (dlg.open = true);
    dlg.close = () => (dlg.open = false);
    off = show.init(document);
    document.getElementById("open")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(dlg.open, true);
    document.getElementById("shut")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(dlg.open, false);
  });
});

describe("show chunk: a panel carrying its ancestor overlay's command is inert", () => {
  let off: (() => void) | void;
  afterEach(() => {
    if (off) off();
  });

  it("clicks on blank panel space, or inside it, do not close the overlay; the backdrop still does", () => {
    resetDom(
      '<div id="m" commandfor="m" command="hide-popover" popover="manual"><div id="panel" commandfor="m" command="toggle-popover"><span id="inner">x</span><a id="link" data-close-link href="#">l</a></div></div>',
    );
    const m = document.getElementById("m") as any;
    m.hidePopover = () => m.setAttribute("data-closed", "1");
    m.matches = (s: string) => (s === ":popover-open" ? !m.hasAttribute("data-closed") : Element.prototype.matches.call(m, s));
    off = show.init(document);
    document.getElementById("panel")!.dispatchEvent(new Event("click", { bubbles: true }));
    document.getElementById("inner")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(m.hasAttribute("data-closed"), false);
    m.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(m.getAttribute("data-closed"), "1");
  });

  it("a panel with close on an ancestor dialog is inert; a tile elsewhere still opens", () => {
    resetDom('<dialog id="dlg"><div id="panel" commandfor="dlg" command="close"><p>x</p></div></dialog><div id="tile" commandfor="dlg" command="show-modal"></div>');
    const dlg = document.getElementById("dlg") as any;
    dlg.open = true;
    dlg.showModal = () => (dlg.open = true);
    dlg.close = () => (dlg.open = false);
    off = show.init(document);
    document.getElementById("panel")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(dlg.open, true);
    dlg.open = false;
    document.getElementById("tile")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(dlg.open, true);
  });
});

describe("show chunk: a childless strip inside the overlay it names is a backdrop", () => {
  it("a click on an empty click-away strip beside a drawer hides the overlay", () => {
    resetDom('<div id="m" popover="manual"><div id="strip" commandfor="m" command="hide-popover"></div><div id="drawer"></div></div>');
    const m = document.getElementById("m") as any;
    m.hidePopover = () => m.setAttribute("data-closed", "1");
    m.matches = (s: string) => (s === ":popover-open" ? !m.hasAttribute("data-closed") : Element.prototype.matches.call(m, s));
    const off = show.init(document);
    document.getElementById("drawer")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(m.hasAttribute("data-closed"), false);
    document.getElementById("strip")!.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(m.getAttribute("data-closed"), "1");
    if (off) off();
  });
});
