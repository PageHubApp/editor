import "./setup.ts";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import type { CanvasHost } from "../src/features/canvas/canvasHost.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { RichTextLayer } from "../src/features/richtext/RichTextLayer.tsx";
import { richTextKit } from "../src/features/richtext/richTextState.ts";
import { iconRefOf } from "../src/features/richtext/schema.ts";
import { render, type Rendered } from "./harness.tsx";
import { fireIn, rendered, wait } from "./canvasHarness.tsx";

const SVG = `<svg viewBox="0 0 24 24" data-test-icon=""><path d="M1 1h22"/></svg>`;
const PAGE = `<h1>{{ 'tb/TbBarbell' | icon }} Strength {{ 'tb/TbNope' | icon }}</h1>\n`;

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetOverlaysForTests();
});

async function editH1(host: CanvasHost) {
  const e = createTestEditor({ files: { "index.liquid": PAGE }, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit(), richTextKit()] });
  const r = render(<Editor editor={e} canvasHost={host} components={{ InlineTextToolbar: RichTextLayer }} />);
  mounted = r;
  const doc = await rendered(r);
  const h1 = doc.querySelector("h1")!;
  await fireIn(h1, "mousedown");
  await fireIn(h1, "mouseup", { clientX: 50 });
  await fireIn(h1, "mousedown");
  await wait(5);
  return { e, h1: doc.querySelector("h1")! };
}

test("iconRefOf: the ref of a plain icon output, null for anything else", () => {
  assert.equal(iconRefOf(`{{ 'tb/TbBarbell' | icon }}`), "tb/TbBarbell");
  assert.equal(iconRefOf(`{{- "fa6/FaXTwitter" | icon -}}`), "fa6/FaXTwitter");
  assert.equal(iconRefOf(`{{ product.title }}`), null);
  assert.equal(iconRefOf(`{{ icon_ref | icon }}`), null, "a variable ref has no fixed icon");
});

test("editing text: an icon output shows as the icon, an unknown one as its source chip; the source is unchanged", async () => {
  const host: CanvasHost = { host: { icon: (ref) => (ref === "tb/TbBarbell" ? SVG : undefined) } };
  const { e, h1 } = await editH1(host);
  assert.ok(h1.hasAttribute("data-rt-editing"));
  const icon = h1.querySelector("[data-rt-icon]")!;
  assert.equal(icon.getAttribute("data-rt-icon"), "tb/TbBarbell");
  assert.ok(icon.querySelector("svg[data-test-icon]"), "the icon's own svg");
  assert.equal(h1.querySelectorAll(".ph-rt-chip").length, 1, "the unknown icon stays a source chip");
  assert.match(h1.querySelector(".ph-rt-chip")!.textContent!, /TbNope/);
  await fireIn(h1, "blur");
  assert.equal(e.state.files.get("index.liquid"), PAGE);
});
