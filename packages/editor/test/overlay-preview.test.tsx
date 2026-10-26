import "./setup.ts";
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { canvasOf, canvasPage } from "../src/features/canvas/canvasState.ts";
import { applyOverlayPreview } from "../src/features/canvas/frameDom.ts";
import { overlayTargetSrc } from "../src/features/canvas/overlayPreview.ts";
import { canvasEditor, fireIn, mountCanvas, rendered, setRect, wait } from "./canvasHarness.tsx";
import { actRun, render, withEditor } from "./harness.tsx";
import { ActionsEditor } from "../src/features/inspector/ActionsEditor.tsx";
import * as runtimeStore from "../../site-runtime/src/state-store.ts";
import { runStateAction } from "../../site-runtime/src/state-action.ts";

// happy-dom has no Popover API: a stand-in that records the open state the way the browser's `:popover-open` does.
before(() => {
  const proto = globalThis.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.showPopover ??= function (this: HTMLElement) {
    this.setAttribute("data-popover-open", "");
  };
  proto.hidePopover ??= function (this: HTMLElement) {
    this.removeAttribute("data-popover-open");
  };
});

const PAGE = `<header><button id="burger" popovertarget="drawer" aria-label="Menu">Menu</button><button id="signup" commandfor="signup-dialog" command="show-modal">Sign up</button></header>
<nav id="drawer" popover><a id="inner" href="/a">Inside drawer</a></nav>
<dialog id="signup-dialog"><p id="in-dialog">Hello</p><button id="close" commandfor="signup-dialog" command="close">Close</button></dialog>
<p class="other">x</p>
`;
const files = { "index.liquid": PAGE };

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const popoverOpen = (doc: Document) => doc.querySelector("nav")!.hasAttribute("data-popover-open");
const dialogOpen = (doc: Document) => doc.querySelector("dialog")!.hasAttribute("open");

describe("open on canvas: popover and dialog preview", () => {
  it("resolves the target from the overlay itself or its trigger, and nothing else", async () => {
    const { r, doc } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    const src = (sel: string) => doc.querySelector(sel)!.getAttribute("data-edit-src");
    const drawer = src("nav");
    assert.ok(drawer);
    assert.equal(overlayTargetSrc(doc, drawer), drawer, "the popover itself");
    assert.equal(overlayTargetSrc(doc, src("#burger")), drawer, "popovertarget");
    assert.equal(overlayTargetSrc(doc, src("#signup")), src("dialog"), "commandfor + show-modal");
    assert.equal(overlayTargetSrc(doc, src("#close")), src("dialog"), "a close button points at its dialog: closing previews too");
    assert.equal(overlayTargetSrc(doc, src(".other")), null);
  });

  it("the name tag's control opens and closes the popover without touching the source, and it survives a re-render", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    const before = e.text();
    setRect(doc.querySelector("#burger")!, { left: 0, top: 0, width: 40, height: 40 });
    await fireIn(doc.querySelector("#burger")!, "mousedown", { clientX: 5, clientY: 5 });
    const btn = () => r.container.querySelector<HTMLElement>("[data-overlay-preview]")!;
    assert.equal(btn().getAttribute("aria-label"), "Open on canvas");
    assert.equal(popoverOpen(doc), false);

    await fireIn(btn(), "click");
    assert.equal(popoverOpen(doc), true);
    assert.equal(doc.querySelector("nav")!.getAttribute("popover"), "manual", "held open: an outside click can't dismiss it");
    assert.equal(canvasOf(e.state).openOverlays.length, 1);
    assert.equal(btn().getAttribute("aria-label"), "Close on canvas");
    assert.equal(e.text(), before, "no source change");

    actRun(e, "attr.set", { name: "data-x", value: "1", at: e.get("p.other") });
    const doc2 = await rendered(r, 2);
    assert.equal(popoverOpen(doc2), true, "still open after the re-render");

    await fireIn(btn(), "click");
    assert.equal(popoverOpen(doc2), false);
    assert.equal(doc2.querySelector("nav")!.getAttribute("popover"), "", "the page's own popover value is back");
    assert.equal(canvasOf(e.state).openOverlays.length, 0);
    assert.equal(e.text().replace(/ data-x="1"/, ""), before);
  });

  it("opens a closed dialog non-modally from its trigger and closes it again", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    await fireIn(doc.querySelector("#signup")!, "mousedown", { clientX: 5, clientY: 5 });
    const btn = () => r.container.querySelector<HTMLElement>("[data-overlay-preview]")!;
    await fireIn(btn(), "click");
    assert.equal(dialogOpen(doc), true);
    assert.equal(e.text(), PAGE);
    await fireIn(btn(), "click");
    assert.equal(dialogOpen(doc), false);
  });

  it("an element inside the open drawer can be selected", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    await fireIn(doc.querySelector("#burger")!, "mousedown", { clientX: 5, clientY: 5 });
    await fireIn(r.container.querySelector<HTMLElement>("[data-overlay-preview]")!, "click");
    await fireIn(doc.querySelector("#inner")!, "mousedown", { clientX: 5, clientY: 5 });
    assert.equal(e.state.selection.primary, e.get("#inner"));
    assert.equal(popoverOpen(doc), true, "selecting inside keeps it open");
    assert.equal(r.container.querySelector("[data-overlay-preview]"), null, "a plain link opens nothing");
  });

  it("no control on an element that is neither", async () => {
    const { r, doc } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    await fireIn(doc.querySelector(".other")!, "mousedown", { clientX: 5, clientY: 5 });
    assert.equal(r.container.querySelector("[data-overlay-preview]"), null);
  });

  it("the layers row has the same toggle", async () => {
    const { r, doc } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    await fireIn(doc.querySelector("nav")!, "mousedown", { clientX: 5, clientY: 5 });
    const row = () => r.container.querySelector<HTMLElement>("[data-layer-row][data-selected] [data-layer-action=overlay]");
    assert.ok(row(), "action on the selected popover row");
    await fireIn(row()!, "click");
    assert.equal(popoverOpen(doc), true);
    assert.equal(row()!.getAttribute("aria-pressed"), "true");
    await fireIn(row()!, "click");
    assert.equal(popoverOpen(doc), false);
  });
});

const SITE = {
  "index.liquid": `{% render 'header' %}\n{% render 'mnav-root' %}\n<main><p class="other">x</p></main>\n`,
  "partials/header.liquid": `<header><button id="burger" commandfor="mobile_nav" command="toggle-popover" aria-label="Menu">Menu</button><a id="logo" href="/">Logo</a></header>\n`,
  "partials/mnav-root.liquid": `<nav id="mobile_nav" popover><a id="inner" href="/a">Inside drawer</a></nav>\n`,
};

/** Wait (real time) until the frame's document satisfies `ok`. */
async function frameWhere(r: { container: HTMLElement }, ok: (d: Document) => boolean): Promise<Document> {
  for (let i = 0; i < 100; i++) {
    const d = (r.container.querySelector("[data-canvas-frame]") as HTMLIFrameElement).contentDocument!;
    if (ok(d)) return d;
    await wait(10);
  }
  throw new Error("canvas never reached the expected document");
}

describe("open on canvas: trigger and target in different files", () => {
  const navOpen = (doc: Document) => doc.querySelector("nav")?.hasAttribute("data-popover-open") ?? null;
  const btn = (r: { container: HTMLElement }) => r.container.querySelector<HTMLElement>("[data-overlay-preview]");

  it("with the header partial alone on the canvas the toggle still shows, and opens the drawer in its own partial", async () => {
    const e = canvasEditor(SITE);
    const { r, doc } = await mountCanvas(e);
    cleanup = r.unmount;
    const before = e.text("partials/header.liquid");
    const all = Object.fromEntries(Object.keys(SITE).map((k) => [k, e.text(k)]));
    actRun(e, "inspector.set", { componentEditor: "partials/header.liquid" });
    const headerDoc = await frameWhere(r, (d) => !!d.querySelector("#burger") && !d.querySelector("#inner") && !d.querySelector("main"));
    assert.equal(headerDoc.querySelector("nav"), null, "the drawer is not in this canvas");
    await fireIn(headerDoc.querySelector("#burger")!, "mousedown", { clientX: 5, clientY: 5 });
    assert.equal(btn(r)?.getAttribute("aria-label"), "Open on canvas");
    assert.equal(canvasPage(e.state), "partials/header.liquid", "nothing moved yet");

    await fireIn(btn(r)!, "click");
    assert.equal(canvasPage(e.state), "partials/mnav-root.liquid", "the target's partial is on the canvas");
    assert.equal(canvasOf(e.state).openOverlays.length, 1);
    const navDoc = await frameWhere(r, (d) => !!d.querySelector("nav") && !d.querySelector("#burger"));
    assert.equal(navOpen(navDoc), true, "the drawer shows open");
    for (const k of Object.keys(SITE)) assert.equal(e.text(k), all[k], "no file changed: " + k);
    assert.equal(e.text("partials/header.liquid"), before);
  });

  it("the Action card has the same toggle, and closing never navigates", async () => {
    const e = canvasEditor(SITE);
    const { r } = await mountCanvas(e);
    cleanup = r.unmount;
    actRun(e, "inspector.set", { componentEditor: "partials/header.liquid" });
    await frameWhere(r, (d) => !!d.querySelector("#burger") && !d.querySelector("main"));
    const panelRoot = render(withEditor(e, <ActionsEditor handle={e.get("#burger", "partials/header.liquid")} />));
    const card = () => document.body.querySelector<HTMLElement>("[data-action-overlay]");
    assert.equal(card()?.textContent, "Open on canvas");
    await fireIn(card()!, "click");
    assert.equal(canvasPage(e.state), "partials/mnav-root.liquid");
    // back on the header: the overlay is already open, so the toggle closes it in place
    actRun(e, "inspector.set", { componentEditor: "partials/header.liquid" });
    await frameWhere(r, (d) => !!d.querySelector("#burger") && !d.querySelector("main"));
    assert.equal(card()?.textContent, "Close on canvas");
    await fireIn(card()!, "click");
    assert.equal(canvasPage(e.state), "partials/header.liquid", "closing stays put");
    assert.equal(canvasOf(e.state).openOverlays.length, 0);
    panelRoot.unmount();
  });

  it("a trigger whose target exists nowhere gets no toggle", async () => {
    const e = canvasEditor({ ...SITE, "partials/header.liquid": `<header><button id="burger" commandfor="nope" command="toggle-popover">Menu</button></header>\n` });
    const { r } = await mountCanvas(e);
    cleanup = r.unmount;
    actRun(e, "inspector.set", { componentEditor: "partials/header.liquid" });
    const doc = await frameWhere(r, (d) => !!d.querySelector("#burger") && !d.querySelector("main"));
    await fireIn(doc.querySelector("#burger")!, "mousedown", { clientX: 5, clientY: 5 });
    assert.equal(btn(r), null);
  });
});

describe("open on canvas: Action card", () => {
  let panel: (() => void) | null = null;
  afterEach(() => {
    panel?.();
    panel = null;
  });
  const card = (type: string) => document.body.querySelector<HTMLElement>(`[data-action-card="${type}"]`);
  const toggle = () => document.body.querySelector<HTMLElement>("[data-action-overlay]");
  /** The Action card over the mounted canvas: the card's own root, sharing the canvas editor. */
  const mountCard = (e: Parameters<typeof withEditor>[0], sel: string) => {
    const r = render(withEditor(e, <ActionsEditor handle={e.get(sel)} />));
    panel = r.unmount;
    return r;
  };

  it("a Show / Hide card toggles the same preview, with human option labels", async () => {
    const page = `<header><button id="burger" commandfor="drawer" command="toggle-popover">Menu</button></header><nav id="drawer" popover><a href="/a">Inside</a></nav>\n`;
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": page }));
    cleanup = r.unmount;
    mountCard(e, "#burger");
    assert.ok(card("show-hide"), "the card renders");
    assert.equal(toggle()?.textContent, "Open on canvas");
    assert.match(card("show-hide")!.textContent ?? "", /Toggle/, "Direction reads Toggle, not toggle-popover");
    assert.doesNotMatch(card("show-hide")!.textContent ?? "", /toggle-popover/);
    const before = e.text();
    await fireIn(toggle()!, "click");
    assert.equal(popoverOpen(doc), true);
    assert.equal(toggle()?.textContent, "Close on canvas");
    assert.equal(e.text(), before);
    await fireIn(toggle()!, "click");
    assert.equal(popoverOpen(doc), false);
  });

  it("an Open Modal card opens the dialog; a close command has no toggle", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor(files));
    cleanup = r.unmount;
    mountCard(e, "#signup");
    assert.ok(card("open-modal"));
    await fireIn(toggle()!, "click");
    assert.equal(dialogOpen(doc), true);
    panel?.();
    mountCard(e, "#close");
    assert.ok(toggle(), "a close command is a trigger too");
  });
});

describe("open on canvas: every direction and every trigger kind", () => {
  const DIRS = `<nav id="drawer" popover><a href="/a">x</a></nav>
<button id="hide-attr" popovertarget="drawer" popovertargetaction="hide">x</button>
<button id="hide-cmd" commandfor="drawer" command="hide-popover">x</button>
<button id="close-cmd" commandfor="drawer" command="close">x</button>
<button id="hover" data-show-on="hover" data-show-target="drawer" data-show-dir="show">x</button>
<div id="load" data-show-on="load" data-show-dir="show" popover>self</div>
<a id="link" href="#top">x</a><button id="copy" data-copy="hi">x</button><button id="track" data-track="ga4:x">x</button><button id="buy" data-cart="add" data-cart-id="p">x</button><button id="out" data-cart="checkout">x</button>
`;
  it("hide, close, hover and load triggers resolve their target; links, copy, track, add and checkout do not", async () => {
    const { r, doc } = await mountCanvas(canvasEditor({ "index.liquid": DIRS }));
    cleanup = r.unmount;
    const src = (sel: string) => doc.querySelector(sel)!.getAttribute("data-edit-src");
    const drawer = src("nav");
    for (const id of ["hide-attr", "hide-cmd", "close-cmd", "hover"]) assert.equal(overlayTargetSrc(doc, src("#" + id)), drawer, id);
    assert.equal(overlayTargetSrc(doc, src("#load")), src("#load"), "data-show-on on the popover itself");
    for (const id of ["link", "copy", "track", "buy", "out"]) assert.equal(overlayTargetSrc(doc, src("#" + id)), null, id);
  });

  it("a hide button's name-tag control opens the drawer and says Close once it is open", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": DIRS }));
    cleanup = r.unmount;
    await fireIn(doc.querySelector("#hide-cmd")!, "mousedown", { clientX: 5, clientY: 5 });
    const btn = () => r.container.querySelector<HTMLElement>("[data-overlay-preview]")!;
    assert.equal(btn().getAttribute("aria-label"), "Open on canvas");
    await fireIn(btn(), "click");
    assert.equal(popoverOpen(doc), true);
    assert.equal(btn().getAttribute("aria-label"), "Close on canvas");
    assert.equal(e.text(), DIRS);
  });
});

describe("open on canvas: state actions", () => {
  const STATE_PAGE = `<button id="set" data-state-set="t:menu:open">Set</button>
<button id="tog" data-state-toggle="t:tab:a|b">Toggle</button>
<button id="onoff" data-state-toggle="tflag">Flag</button>
<button id="clr" data-state-clear="t:menu">Clear</button>
<button id="inc" data-state-step="t:n:+1">Inc</button>
<button id="cart" data-cart="open">Cart</button>
<button id="lonely" data-state-set="t:unread:1">Nobody reads</button>
<button id="stored" data-state-set="local:t:menu:open">Stored</button>
<div data-state-show="t:menu=open">menu</div><div data-state-show="t:tab=b">tab b</div><div data-state-show="tflag">flag</div><div data-state-show="t:n>0">n</div><aside data-state-show="cart:open">cart</aside>
`;
  const install = (doc: Document) => void ((doc.defaultView as unknown as Record<string, unknown>).__siteRuntime = { state: { get: runtimeStore.get, set: runtimeStore.set, run: runStateAction } });
  afterEach(() => {
    for (const k of ["t:menu", "t:tab", "tflag", "t:n", "cart:open"]) runtimeStore.set(k, undefined);
  });
  const pick = async (r: { container: HTMLElement }, doc: Document, sel: string) => {
    await fireIn(doc.querySelector(sel)!, "mousedown", { clientX: 5, clientY: 5 });
    return () => r.container.querySelector<HTMLElement>("[data-overlay-preview]");
  };

  it("set / toggle / clear / step / cart open apply through the runtime store and close restores the previous value", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": STATE_PAGE }));
    cleanup = r.unmount;
    install(doc);
    const get = runtimeStore.get;
    const flip = async (sel: string, check: (on: boolean) => void) => {
      const btn = await pick(r, doc, sel);
      assert.equal(btn()?.getAttribute("aria-label"), "Open on canvas", sel);
      await fireIn(btn()!, "click");
      check(true);
      assert.equal(btn()?.getAttribute("aria-label"), "Close on canvas", sel);
      await fireIn(btn()!, "click");
      check(false);
    };
    await flip("#set", (on) => assert.equal(get("t:menu"), on ? "open" : undefined));
    runtimeStore.set("t:tab", "a");
    await flip("#tog", (on) => assert.equal(get("t:tab"), on ? "b" : "a"));
    await flip("#onoff", (on) => assert.equal(get("tflag"), on ? "true" : undefined));
    runtimeStore.set("t:menu", "open");
    await flip("#clr", (on) => assert.equal(get("t:menu"), on ? undefined : "open"));
    await flip("#inc", (on) => assert.equal(get("t:n"), on ? "1" : undefined));
    await flip("#cart", (on) => assert.equal(get("cart:open"), on ? "true" : undefined));
    assert.deepEqual(canvasOf(e.state).statePreview, {}, "everything closed again");
    assert.equal(e.text(), STATE_PAGE, "no source change");
  });

  it("no control when nothing on the page reads the key, when the key is stored, or without the runtime", async () => {
    const { r, doc } = await mountCanvas(canvasEditor({ "index.liquid": STATE_PAGE }));
    cleanup = r.unmount;
    assert.equal((await pick(r, doc, "#set"))(), null, "the runtime has not booted in this frame");
    install(doc);
    assert.equal((await pick(r, doc, "#lonely"))(), null, "no data-state-show reads t:unread");
    assert.equal((await pick(r, doc, "#stored"))(), null, "local: keys would write real localStorage");
    assert.ok((await pick(r, doc, "#set"))(), "and the same page's readable action does");
  });

  it("the Action card of a state action carries the toggle", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": STATE_PAGE }));
    cleanup = r.unmount;
    install(doc);
    const panel = render(withEditor(e, <ActionsEditor handle={e.get("#set")} />));
    const t = () => document.body.querySelector<HTMLElement>("[data-action-overlay]");
    assert.equal(t()?.textContent, "Open on canvas");
    await fireIn(t()!, "click");
    assert.equal(runtimeStore.get("t:menu"), "open");
    assert.equal(t()?.textContent, "Close on canvas");
    await fireIn(t()!, "click");
    assert.equal(runtimeStore.get("t:menu"), undefined);
    panel.unmount();
  });
});

describe("open on canvas: data-show-on targeting a plain element", () => {
  const PLAIN = `<button id="hov" data-show-on="hover" data-show-target="promo" data-show-dir="show">Hover</button>
<div id="promo" class="hidden">Promo</div>
<div id="self" class="hidden" data-show-on="load" data-show-dir="show">Self</div>
<div id="shown">Always</div>
<button id="miss" data-show-on="hover" data-show-target="nope">x</button>
`;
  const hidden = (doc: Document, sel: string) => doc.querySelector(sel)!.classList.contains("hidden");

  it("resolves the plain target (or the element itself), un-hides it view-only, and closes back to hidden", async () => {
    const { r, doc, e } = await mountCanvas(canvasEditor({ "index.liquid": PLAIN }));
    cleanup = r.unmount;
    const before = e.text();
    const src = (sel: string) => doc.querySelector(sel)!.getAttribute("data-edit-src");
    assert.equal(overlayTargetSrc(doc, src("#hov")), src("#promo"), "data-show-target");
    assert.equal(overlayTargetSrc(doc, src("#self")), src("#self"), "no target: the element itself");
    assert.equal(overlayTargetSrc(doc, src("#shown")), null);
    assert.equal(overlayTargetSrc(doc, src("#miss")), null, "an id that is nowhere in the doc resolves to nothing");
    await fireIn(doc.querySelector("#hov")!, "mousedown", { clientX: 5, clientY: 5 });
    const btn = () => r.container.querySelector<HTMLElement>("[data-overlay-preview]")!;
    assert.equal(btn().getAttribute("aria-label"), "Open on canvas");
    assert.equal(hidden(doc, "#promo"), true);
    await fireIn(btn(), "click");
    assert.equal(hidden(doc, "#promo"), false, "the target shows");
    assert.equal(btn().getAttribute("aria-label"), "Close on canvas");
    assert.equal(e.text(), before, "nothing written to the files");
    await fireIn(btn(), "click");
    assert.equal(hidden(doc, "#promo"), true, "closing puts the hidden class back");
    assert.equal(doc.querySelector("#promo")!.hasAttribute("data-ph-show-open"), false);
  });

  it("applyOverlayPreview un-hides on a re-apply and re-hides when the src leaves the set", () => {
    const doc = document.implementation.createHTMLDocument("t");
    doc.body.innerHTML = `<div id="a" class="hidden" data-edit-src="a#1"></div><div id="b" data-edit-src="b#1"></div>`;
    applyOverlayPreview(doc, ["a#1", "b#1"]);
    assert.equal(doc.getElementById("a")!.classList.contains("hidden"), false);
    assert.equal(doc.getElementById("b")!.hasAttribute("data-ph-show-open"), false, "an already visible element is left alone");
    applyOverlayPreview(doc, ["a#1"]);
    assert.equal(doc.getElementById("a")!.classList.contains("hidden"), false);
    applyOverlayPreview(doc, []);
    assert.equal(doc.getElementById("a")!.classList.contains("hidden"), true);
  });
});
