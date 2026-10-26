// Live preview: Preview with the site's own scripts, in a sandboxed frame on the host's preview URL
// (docs/action-items/specs/site-js-allowed.md). The frame never shares the editor's origin with author code.
import "./setup.ts";
import { describe, it, afterEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import type { CanvasHost } from "../src/features/canvas/canvasHost.ts";
import { chromeOf } from "../src/shell/chromeState.ts";
import { canvasPage } from "../src/features/canvas/canvasState.ts";
import { liveBasePath, liveFrameOrigin, liveFrameSandbox, livePreviewOf, readLiveMessage, routeOfLivePath } from "../src/features/canvas/livePreview.ts";
import { Editor } from "../src/index.ts";
import { canvasEditor, rendered, wait } from "./canvasHarness.tsx";
import { actRun, render } from "./harness.tsx";

const HERE = "https://editor.test/dashboard/sites/s1/design";

describe("live preview: origin rules", () => {
  it("a same-origin preview is sandboxed to an opaque origin; a cross-origin one keeps its own; never top navigation", () => {
    const same = liveFrameSandbox("/view/s1", HERE);
    assert.equal(same, "allow-scripts allow-forms allow-popups");
    assert.ok(!same.includes("allow-same-origin") && !same.includes("escape-sandbox"));
    assert.equal(liveFrameSandbox("https://editor.test/view/s1/about", HERE), same, "an absolute URL on our origin is still same-origin");
    const cross = liveFrameSandbox("https://s1.preview.test/view/s1", HERE);
    assert.ok(cross.split(" ").includes("allow-same-origin"));
    for (const s of [same, cross]) assert.ok(!s.includes("allow-top-navigation"));
    assert.equal(liveFrameOrigin("/view/s1", HERE), "null");
    assert.equal(liveFrameOrigin("https://s1.preview.test/view/s1", HERE), "https://s1.preview.test");
  });

  it("messages: only the frame's window, its origin, the right shape and a path under the preview's base", () => {
    const win = {};
    const ok = { source: win, origin: "https://s1.preview.test", basePath: "/view/s1" };
    const msg = (data: unknown, over: Partial<{ source: unknown; origin: string }> = {}) => readLiveMessage({ data, origin: over.origin ?? ok.origin, source: "source" in over ? over.source : win }, ok);
    assert.deepEqual(msg({ type: "ph-live-location", path: "/view/s1/about?x=1", y: 120.4 }), { path: "/view/s1/about?x=1", y: 120 });
    assert.deepEqual(msg({ type: "ph-live-location", path: "/view/s1", y: -5 }), { path: "/view/s1", y: 0 });
    assert.equal(msg({ type: "ph-live-location", path: "/view/s1", y: 1 }, { source: {} }), null, "another window");
    assert.equal(msg({ type: "ph-live-location", path: "/view/s1", y: 1 }, { origin: "https://evil.test" }), null, "another origin");
    assert.equal(msg({ type: "ph-live-location", path: "/view/s1", y: 1 }, { source: null }), null, "no source");
    assert.equal(readLiveMessage({ data: { type: "ph-live-location", path: "/view/s1" }, origin: "x", source: win }, { ...ok, source: null }), null, "no frame yet");
    for (const path of ["/view/s2", "/view/s10", "//evil.test/view/s1", "https://evil.test/view/s1", "/view/s1 x", "/api/user/me", 7]) {
      assert.equal(msg({ type: "ph-live-location", path, y: 0 }), null, `path ${String(path)}`);
    }
    for (const data of [null, "ph-live-location", { type: "ph-live-scroll", y: 1 }, { type: "ph-live-location" }]) assert.equal(msg(data), null);
    assert.equal(msg({ type: "ph-live-location", path: "/view/s1", y: Number.NaN })?.y, 0);
    assert.equal(msg({ type: "ph-live-location", path: "/view/s1", y: 1e12 })?.y, 1_000_000);
  });

  it("routes and base paths", () => {
    assert.equal(routeOfLivePath("/view/s1", "/view/s1"), "/");
    assert.equal(routeOfLivePath("/view/s1/?a=1", "/view/s1"), "/");
    assert.equal(routeOfLivePath("/view/s1/about/?a=1#x", "/view/s1"), "/about");
    assert.equal(routeOfLivePath("/view/s12/about", "/view/s1"), null);
    assert.equal(liveBasePath("https://s1.preview.test/view/s1", HERE), "/view/s1");
    assert.equal(liveBasePath("/view/s1/", HERE), "/view/s1");
  });
});

// happy-dom loads iframe pages; the live frame's navigations are recorded instead.
const sent: string[] = [];
const proto = window.HTMLIFrameElement.prototype;
const desc = Object.getOwnPropertyDescriptor(proto, "src")!;
before(() => {
  Object.defineProperty(proto, "src", {
    configurable: true,
    get(this: HTMLIFrameElement) {
      return this.hasAttribute("data-live-preview") ? (sent[sent.length - 1] ?? "") : desc.get!.call(this);
    },
    set(this: HTMLIFrameElement, v: string) {
      if (this.hasAttribute("data-live-preview")) sent.push(v);
      else desc.set!.call(this, v);
    },
  });
});
after(() => void Object.defineProperty(proto, "src", desc));

const FILES = { "pages/index.liquid": `<h1>Home</h1>`, "pages/about.liquid": `<h1>About</h1>` };
const HOST: CanvasHost = { previewUrl: (route) => `https://s1.preview.test/view/s1${route === "/" ? "" : route}` };
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const u of mounted.splice(0)) u();
  sent.length = 0;
});
async function mount(host: CanvasHost | undefined = HOST) {
  const e = canvasEditor(FILES);
  const r = render(<Editor editor={e} canvasHost={host} />);
  mounted.push(r.unmount);
  await rendered(r);
  return { e, r };
}
const liveFrame = (r: { container: HTMLElement }) => r.container.querySelector("iframe[data-live-preview]") as HTMLIFrameElement | null;
const post = async (frame: HTMLIFrameElement, data: unknown, origin = "https://s1.preview.test", source: unknown = frame.contentWindow) =>
  act(async () => void window.dispatchEvent(new MessageEvent("message", { data, origin, source: source as Window })));

describe("live preview: the mode", () => {
  it("Preview shows 'Run site scripts'; on, a sandboxed frame loads the page and the inert canvas hides; off, the canvas is back", async () => {
    const { e, r } = await mount();
    assert.equal(r.all("[data-live-preview-toggle]").length, 0, "not in edit mode");
    actRun(e, "preview.toggle");
    await r.click(r.get("[data-live-preview-toggle]"));
    assert.equal(livePreviewOf(e.state), true);
    const f = liveFrame(r)!;
    assert.ok(f, "the live frame");
    assert.equal(f.getAttribute("sandbox"), "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin");
    assert.deepEqual(sent, ["https://s1.preview.test/view/s1"]);
    assert.equal((r.get("[data-canvas-frame]") as HTMLElement).style.display, "none");
    assert.equal(r.get("[data-live-preview-toggle]").getAttribute("aria-pressed"), "true");
    await r.click(r.get("[data-live-preview-toggle]"));
    assert.equal(liveFrame(r), null);
    assert.notEqual((r.get("[data-canvas-frame]") as HTMLElement).style.display, "none");
    assert.equal(chromeOf(e.state).preview, true, "still previewing, on the canvas");
  });

  it("'preview.live' from edit mode enters Preview with scripts; Edit leaves it; a same-origin preview gets an opaque sandbox", async () => {
    const { e, r } = await mount({ previewUrl: (route) => `/view/s1${route === "/" ? "" : route}` });
    actRun(e, "preview.live");
    assert.equal(chromeOf(e.state).preview, true);
    assert.equal(liveFrame(r)!.getAttribute("sandbox"), "allow-scripts allow-forms allow-popups");
    await r.click(r.get("[data-preview-edit]"));
    assert.equal(chromeOf(e.state).preview, false);
    assert.equal(liveFrame(r), null);
  });

  it("no previewUrl: no toggle and no live frame", async () => {
    const { e, r } = await mount({});
    actRun(e, "preview.toggle");
    assert.equal(r.all("[data-live-preview-toggle]").length, 0);
    actRun(e, "preview.live");
    assert.equal(liveFrame(r), null);
  });

  it("unsaved edits are saved first ('Saving your changes…'); each later save reloads at the frame's page and scroll", async () => {
    const { e, r } = await mount();
    act(() => void e.dispatch((tr) => tr.setText(e.get("h1"), "Changed")));
    actRun(e, "preview.live");
    await wait(20);
    assert.equal(e.dirty().length, 0, "the edit was saved");
    assert.deepEqual(sent, ["https://s1.preview.test/view/s1"]);
    const f = liveFrame(r)!;
    await act(async () => void f.dispatchEvent(new Event("load")));
    assert.equal(f.getAttribute("data-live-phase"), "ready");
    await post(f, { type: "ph-live-location", path: "/view/s1/?tab=2", y: 300 });
    await act(async () => void (await e.save()));
    act(() => void e.dispatch((tr) => tr.setText(e.get("h1"), "Again")));
    await act(async () => void (await e.save()));
    assert.equal(sent[sent.length - 1], "https://s1.preview.test/view/s1/?tab=2");
    assert.equal(f.getAttribute("data-live-phase"), "reloading");
    assert.match(r.get("[data-live-status]").textContent!, /Reloading with your changes/);
    const posted: Array<[unknown, string]> = [];
    (f.contentWindow as unknown as { postMessage: (m: unknown, o: string) => void }).postMessage = (m, o) => void posted.push([m, o]);
    await post(f, { type: "ph-live-location", path: "/view/s1/?tab=2", y: 0 }); // the reloaded page reports itself before `load`
    await act(async () => void f.dispatchEvent(new Event("load")));
    assert.deepEqual(posted, [[{ type: "ph-live-scroll", y: 300 }, "https://s1.preview.test"]], "scrolled back, to that origin only");
    assert.equal(r.all("[data-live-status]").length, 0);
  });

  it("a link followed inside the preview moves the page selector; choosing a page loads it; forged messages do nothing", async () => {
    const { e, r } = await mount();
    actRun(e, "preview.live");
    const f = liveFrame(r)!;
    await post(f, { type: "ph-live-location", path: "/view/s1/about", y: 0 }, "https://evil.test");
    await post(f, { type: "ph-live-location", path: "/view/s1/about", y: 0 }, undefined, window);
    assert.equal(canvasPage(e.state), "pages/index.liquid");
    await post(f, { type: "ph-live-location", path: "/view/s1/about", y: 0 });
    assert.equal(canvasPage(e.state), "pages/about.liquid");
    assert.deepEqual(sent, ["https://s1.preview.test/view/s1"], "already on /about: no second load");
    actRun(e, "canvas.set", { page: "pages/index.liquid" });
    await wait(5);
    assert.equal(sent[sent.length - 1], "https://s1.preview.test/view/s1");
    assert.equal(sent.length, 2);
  });
});
