/**
 * Canvas test helpers: happy-dom with iframe documents enabled, an editor with the canvas kit,
 * and waits for the frame's render. Import `./setup.ts` first.
 */
import { mock } from "node:test";
import { act } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { canvasKit } from "../src/features/canvas/canvasState.ts";
import { render, type Rendered } from "./harness.tsx";
import type { Rect } from "../src/features/canvas/geometry.ts";

/** The real timer, captured before any test can mock `globalThis.setTimeout`. */
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

export const PAGE =`<main class="flex flex-col gap-4 p-4">
  <h1 class="text-xl">Hello</h1>
  <ul class="flex gap-2">
    {% for item in items %}<li class="row">{{ item }}</li>{% endfor %}
  </ul>
  <img src="/a.png" alt="A" class="w-10">
  <video src="/v.mp4"></video>
  {% if show %}<p class="note">Note</p>{% endif %}
  {% render 'header' %}
</main>
`;
export const HEADER = `<header class="p-2"><a href="/">Home</a></header>\n`;

export function canvasEditor(files: Record<string, string> = { "index.liquid": PAGE, "partials/header.liquid": HEADER }): TestEditor {
  return createTestEditor({ files, extensions: [htmlKit(), tailwindKit(), editorKit(), canvasKit()], data: { items: ["a", "b", "c"], show: true } });
}

export const frameEl = (r: Rendered) => r.container.querySelector("[data-canvas-frame]") as HTMLIFrameElement;
export const frameDoc = (r: Rendered) => frameEl(r).contentDocument!;

/** Wait until the frame has rendered at least `n` times. */
export async function rendered(r: Rendered, n = 1): Promise<Document> {
  for (let i = 0; i < 200; i++) {
    const v = Number(r.container.querySelector("[data-canvas-frame]")?.getAttribute("data-render-version") ?? 0);
    if (v >= n) return frameDoc(r);
    await act(async () => void (await new Promise((res) => realSetTimeout(res, 5))));
  }
  throw new Error(`canvas did not render ${n} time(s)`);
}

export async function mountCanvas(e: TestEditor = canvasEditor()): Promise<{ r: Rendered; doc: Document; e: TestEditor }> {
  const r = render(<Editor editor={e} />);
  const doc = await rendered(r);
  return { r, doc, e };
}

/** Fake layout: `getBoundingClientRect` for an element (happy-dom has none). */
export function setRect(el: Element, r: Partial<Rect> & { left: number; top: number; width: number; height: number }): void {
  const rect = { x: r.left, y: r.top, left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, toJSON() {} };
  (el as unknown as { getBoundingClientRect(): unknown }).getBoundingClientRect = () => rect;
}

export async function fireIn(el: Element, type: string, init: MouseEventInit & { pointerId?: number } = {}): Promise<void> {
  const win = el.ownerDocument.defaultView as unknown as typeof globalThis;
  const Ctor = type.startsWith("pointer") ? (win.PointerEvent ?? win.MouseEvent) : win.MouseEvent;
  await act(async () => void el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, ...init })));
}

export const wait = (ms: number) => act(async () => void (await new Promise((res) => realSetTimeout(res, ms))));

/**
 * Run `fn` with `setTimeout` on a mock clock (node:test `mock.timers`). Enable it only AFTER mounting:
 * mounting (`rendered`, `wait`, happy-dom's iframe load) waits on timers, and with the clock faked those
 * waits never fire, so the mount hangs or times out. `rendered`/`wait` use the real timer captured at
 * load, so they stay usable inside `fn`; only code under test sees the fake clock. `tick` advances it
 * inside `act` so React flushes the resulting state updates.
 */
export async function withMockTimers(fn: (tick: (ms: number) => Promise<void>) => Promise<void>): Promise<void> {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await fn((ms) => act(async () => void mock.timers.tick(ms)));
  } finally {
    mock.timers.reset();
  }
}
