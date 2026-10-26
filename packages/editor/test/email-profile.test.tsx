import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { editorKit, emailEditorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { AddPanel } from "../src/features/add/AddPanel.tsx";
import { EMAIL_INSPECTOR_SECTIONS } from "../src/features/email/emailEditorKit.ts";
import { mountCanvas } from "./canvasHarness.tsx";
import { actRun, render, withEditor, type Rendered } from "./harness.tsx";

const EMAIL = `<div class="px-[32px]">\n  <h1>Order confirmed</h1>\n  <p>Thanks</p>\n</div>\n`;
const PART = { key: "part:order-lines", label: "Order items", icon: "list", category: "Email", snippet: `{% for line in order.lines %}<p>{{ line.label }}</p>{% endfor %}` };

let open: Rendered[] = [];
let cleanup: (() => void) | null = null;
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  cleanup?.();
  cleanup = null;
  localStorage.clear();
});

const emailEditor = () =>
  createTestEditor({ files: { "emails/order_receipt.liquid": EMAIL }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), emailEditorKit({ tiles: [PART] })] });

describe("email profile", () => {
  it("Add offers only what an email can send: the email elements, the email tiles and the host's parts; no toolbox presets or Automatic", () => {
    const e = emailEditor();
    actRun(e, "insert.open");
    const r = render(withEditor(e, <AddPanel />));
    open.push(r);
    const tiles = r.all("[data-tile]").map((t) => t.getAttribute("data-tile"));
    for (const want of ["html.heading", "html.text", "html.image", "email:button", "email:columns", "email:divider", "part:order-lines"]) assert.ok(tiles.includes(want), want);
    for (const gone of ["html.button", "html.form", "html.input", "automatic"]) assert.ok(!tiles.includes(gone), gone);
    assert.ok(!tiles.some((t) => t?.startsWith("preset:")), "no toolbox presets");
    assert.ok(r.all("[data-tile-category]").some((c) => c.getAttribute("data-tile-category") === "Email"));
  });

  it("the canvas is exactly 600px: breakpoint views, the scope band and the width handles are off", async () => {
    const { r, e } = await mountCanvas(emailEditor());
    cleanup = r.unmount;
    assert.equal(r.get("[data-canvas-host]").style.maxWidth, "min(100%, 600px)");
    actRun(e, "canvas.view", { view: "lg" });
    assert.equal(r.get("[data-canvas-host]").style.maxWidth, "min(100%, 600px)");
    assert.equal(r.container.querySelector("[data-edge-handle]"), null);
  });

  it("the inspector keeps what inboxes support", () => {
    assert.deepEqual([...EMAIL_INSPECTOR_SECTIONS].sort(), ["alignment", "background", "size", "styles", "typography"]);
  });
});
