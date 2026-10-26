// Which of the editor document's stylesheets reach the canvas frame.
import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CANVAS_BRIDGE_ATTR, writeFrame } from "../src/features/canvas/frameDom.ts";

function hostWith(): HTMLIFrameElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/app.css";
  link.setAttribute("data-test", "");
  const appStyle = document.createElement("style");
  appStyle.textContent = ".collapse{visibility:collapse}";
  appStyle.setAttribute("data-test", "");
  const bridge = document.createElement("style");
  bridge.textContent = ".ph-mod-x{color:red}";
  bridge.setAttribute(CANVAS_BRIDGE_ATTR, "");
  bridge.setAttribute("data-test", "");
  document.head.append(link, appStyle, bridge);
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  return frame;
}

afterEach(() => {
  document.querySelectorAll("[data-test], iframe").forEach((n) => n.remove());
});

describe("canvas frame styles", () => {
  it("a page with its own compiled stylesheet gets only the canvas bridge styles", () => {
    const doc = hostWith().contentDocument!;
    writeFrame(doc, `<html><head><style id="site-css">.collapse{display:none}</style></head><body><p>hi</p></body></html>`);
    assert.equal(doc.querySelectorAll('link[rel="stylesheet"]').length, 0, "no app stylesheet link");
    const texts = [...doc.querySelectorAll("style")].map((s) => s.textContent);
    assert.ok(texts.includes(".ph-mod-x{color:red}"), "bridge style mirrored");
    assert.ok(!texts.includes(".collapse{visibility:collapse}"), "app style not mirrored");
  });

  it("a page without one still gets the editor's stylesheets", () => {
    const doc = hostWith().contentDocument!;
    writeFrame(doc, `<html><head></head><body><p class="collapse">hi</p></body></html>`);
    assert.equal(doc.querySelectorAll('link[rel="stylesheet"]').length, 1);
    assert.ok([...doc.querySelectorAll("style")].some((s) => s.textContent === ".collapse{visibility:collapse}"));
  });
});
