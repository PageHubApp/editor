/**
 * Small render helper for editor tests (node:test + tsx + happy-dom). Import `./setup.ts`
 * before this file.
 *
 *   const r = render(<Editor editor={e} />);
 *   await r.click(r.get("[data-ph-bp-chip]"));
 *   r.unmount();
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { DEFAULT_COMPONENTS, editorKit } from "../src/index.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { ComponentsProvider } from "../src/components.ts";

export interface Rendered {
  container: HTMLElement;
  get<T extends HTMLElement = HTMLElement>(selector: string): T;
  all(selector: string): HTMLElement[];
  rerender(ui: ReactNode): void;
  unmount(): void;
  click(el: Element, init?: MouseEventInit): Promise<void>;
  /** Type into an input / textarea the way React sees it (native setter + `input`). */
  type(el: Element, value: string): Promise<void>;
  fire(el: Element, type: string, init?: MouseEventInit): Promise<void>;
}

export function render(ui: ReactNode): Rendered {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const get = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = document.body.querySelector<T>(sel);
    if (!el) throw new Error(`no element matches ${sel}`);
    return el;
  };
  const fire = async (el: Element, type: string, init: MouseEventInit = {}) => {
    await act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })));
  };
  return {
    container,
    get,
    all: (sel) => [...document.body.querySelectorAll<HTMLElement>(sel)],
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
    click: (el, init) => fire(el, "click", init),
    fire,
    type: async (el, value) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
  };
}

export const FIXTURE = `<section class="flex p-4 md:p-8 lg:p-10 gap-2">
  <h1 class="text-xl">Hello</h1>
  <p class="text-base">World</p>
</section>
`;

/** A test editor on the fixture page with the kits the chrome needs; the section selected. */
export function fixtureEditor(src = FIXTURE): TestEditor {
  const e = createTestEditor({ files: { "index.liquid": src }, extensions: [htmlKit(), tailwindKit(), editorKit()] });
  e.select(e.get("section"));
  return e;
}

/** Count state notifications whose files changed (one per applied write). */
export function countWrites(e: TestEditor): { readonly n: number } {
  const c = { n: 0 };
  e.subscribe((s) => s.files, () => c.n++);
  return c;
}

/** The providers `<Editor>` sets up, around a single control. */
export function withEditor(e: TestEditor, ui: ReactNode): ReactNode {
  return (
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>{ui}</ComponentsProvider>
    </EditorStoreProvider>
  );
}

/** Run a command inside act() (state changes outside an event handler). */
export function actRun(e: TestEditor, id: string, args?: unknown): boolean {
  let ok = false;
  act(() => void (ok = e.run(id, args)));
  return ok;
}
