import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import type { CanvasHost } from "../src/features/canvas/canvasHost.ts";
import { Editor } from "../src/index.ts";
import { canvasEditor, frameDoc, rendered } from "./canvasHarness.tsx";
import { actRun, render } from "./harness.tsx";

const FILES = { "index.liquid": `<h1>Hi</h1><p class="hv">{{ hostValue }}</p><img alt="" src="{{ 'k1' | image_url }}">`, "theme.css": `@import url("https://fonts.googleapis.com/css2?family=Inter&display=swap");\n:root{--x:1}` };
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const u of mounted.splice(0)) u();
});
async function mount(host?: CanvasHost) {
  const e = canvasEditor(FILES);
  const r = render(<Editor editor={e} canvasHost={host} />);
  mounted.push(r.unmount);
  return { e, r, doc: await rendered(r) };
}

describe("canvasHost", () => {
  it("with no host the canvas makes no request: no site CSS, remote font links, no runtime, no preview link", async () => {
    const real = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = ((...a: Parameters<typeof fetch>) => (calls++, real(...a))) as typeof fetch;
    try {
      const { r, doc } = await mount();
      assert.equal(calls, 0);
      assert.equal(doc.getElementById("site-css"), null);
      assert.equal(doc.querySelector("script[data-ph-runtime]"), null);
      assert.ok(doc.querySelector("link[data-site-font][href*='fonts.googleapis.com']"), "remote font stylesheet");
      assert.equal(r.all("[data-page-open]").length, 0);
      assert.equal(doc.querySelector("img")?.getAttribute("src")?.startsWith("data:image/svg+xml"), true, "an image id with nowhere to point paints the placeholder");
    } finally {
      globalThis.fetch = real;
    }
  });

  it("timezone: `| date` renders in the host's zone on the canvas, UTC with none or an unknown one", async () => {
    const DATES = { "index.liquid": `<p id="d">{{ '2026-06-15T03:30:00Z' | date: '%Y-%m-%d %H:%M' }}</p>` };
    const text = async (host?: CanvasHost) => {
      const e = canvasEditor(DATES);
      const r = render(<Editor editor={e} canvasHost={host} />);
      mounted.push(r.unmount);
      return (await rendered(r)).getElementById("d")?.textContent;
    };
    assert.equal(await text(), "2026-06-15 03:30");
    assert.equal(await text({ timezone: "America/Los_Angeles" }), "2026-06-14 20:30");
    assert.equal(await text({ timezone: "Mars/Olympus" }), "2026-06-15 03:30");
  });

  it("timezone: a date-time with no offset is that wall-clock time in the host's zone (the same on any server), `| date` and `| time_tag`", async () => {
    const DATES = { "index.liquid": `<p id="d">{{ '2026-06-15T10:00' | date: '%I:%M %p' }}</p><p id="t">{{ '2026-06-15 10:00' | time_tag: '%I:%M %p' }}</p>` };
    const doc = async (host?: CanvasHost) => {
      const e = canvasEditor(DATES);
      const r = render(<Editor editor={e} canvasHost={host} />);
      mounted.push(r.unmount);
      return rendered(r);
    };
    for (const timezone of [undefined, "America/Los_Angeles", "Asia/Kolkata"]) {
      const d = await doc(timezone ? { timezone } : undefined);
      assert.equal(d.getElementById("d")?.textContent, "10:00 AM", String(timezone));
      assert.equal(d.querySelector("#t time")?.textContent, "10:00 AM", String(timezone));
    }
  });

  it("siteCss is inlined in the frame head and refreshed in the background; the last good copy survives a failed refresh", async () => {
    let n = 0;
    let fail = false;
    const { e, r, doc } = await mount({ siteCss: async () => (fail ? Promise.reject(new Error("down")) : `.a{n:${++n}}`) });
    assert.equal(doc.getElementById("site-css")?.textContent, ".a{n:1}");
    fail = true;
    actRun(e, "attr.set", { name: "alt", value: "B", at: e.get("img") });
    const doc2 = await rendered(r, 2);
    assert.equal(doc2.getElementById("site-css")?.textContent, ".a{n:1}");
  });

  it("the site CSS cache belongs to one editor: a second editor with another host never paints the first one's CSS", async () => {
    const a = await mount({ siteCss: async () => ".site-a{}" });
    a.r.unmount();
    mounted.pop();
    const b = await mount({ siteCss: async () => ".site-b{}" });
    assert.equal(b.doc.getElementById("site-css")?.textContent, ".site-b{}");
  });

  it("a siteCss failure with no copy yet is the render error", async () => {
    const e = canvasEditor(FILES);
    const r = render(<Editor editor={e} canvasHost={{ siteCss: async () => Promise.reject(new Error("site styles failed to load (500)")) }} />);
    mounted.push(r.unmount);
    for (let i = 0; i < 100 && !r.container.textContent?.includes("site styles failed"); i++) await act(async () => void (await new Promise((res) => setTimeout(res, 5))));
    assert.match(r.container.textContent ?? "", /site styles failed to load \(500\)/);
  });

  it("fonts: the host's localized faces replace the remote links; a null answer keeps them", async () => {
    const seen: string[][] = [];
    const { doc } = await mount({ fonts: async (urls) => (seen.push([...urls]), { css: "@font-face{font-family:Inter}", preload: [] }) });
    assert.deepEqual(seen, [["https://fonts.googleapis.com/css2?family=Inter&display=swap"]]);
    assert.equal(doc.querySelector("style[data-site-font]")?.textContent, "@font-face{font-family:Inter}");
    assert.equal(doc.querySelector("link[data-site-font]"), null);
    const none = await mount({ fonts: async () => null });
    assert.ok(none.doc.querySelector("link[data-site-font]"));
  });

  it("host.host fills the image_url provider and data() is merged under the editor's own data", async () => {
    const { doc } = await mount({ host: { imageUrl: (id) => `https://cdn.test/${id}/public` }, data: () => ({ hostValue: "from host" }) });
    assert.equal(doc.querySelector("p.hv")?.textContent, "from host");
    assert.equal(doc.querySelector("img")?.getAttribute("src"), "https://cdn.test/k1/public");
  });

  it("runtimeUrl: the runtime loads once as a module, then each write re-enters it through __siteRuntime.start", async () => {
    const { e, r, doc } = await mount({ runtimeUrl: "/rt.js" });
    const script = doc.querySelector("script[data-ph-runtime]") as HTMLScriptElement;
    assert.equal(script.getAttribute("src"), "https://editor.test/rt.js");
    assert.equal(script.type, "module");
    assert.ok(doc.documentElement.hasAttribute("data-ph-edit"));
    let starts = 0;
    (frameDoc(r).defaultView as unknown as { __siteRuntime: { start(): void } }).__siteRuntime = { start: () => void starts++ };
    actRun(e, "attr.set", { name: "alt", value: "B", at: e.get("img") });
    const doc2 = await rendered(r, 2);
    assert.equal(starts, 1);
    assert.equal(doc2.querySelector("script[data-ph-runtime]"), null, "not injected again");
  });

  it("previewUrl feeds the page pill's 'Open in new tab' link", async () => {
    const { r } = await mount({ previewUrl: (route) => `https://preview.test${route}` });
    assert.equal(r.get("[data-page-open]").getAttribute("href"), "https://preview.test/");
  });
});
