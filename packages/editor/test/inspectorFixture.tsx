/** Shared setup for the inspector tests: an editor on a page, the inspector rendered with its slots. */
import { act, type ReactNode } from "react";
import { type Extension } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { ComponentsProvider } from "../src/components.ts";
import { Inspector } from "../src/features/inspector/Inspector.tsx";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { editorKit } from "../src/state/uiState.ts";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { inspectorField } from "../src/features/inspector/inspectorState.ts";
import { render, type Rendered } from "./harness.tsx";

export const PAGE = `<section class="p-4 bg-primary">
  <h1 class="text-xl">Hello</h1>
  <ul><li>One</li></ul>
  <img src="a.png" alt="">
  <video src="v.mp4"></video>
  <audio src="a.mp3"></audio>
  <form><input name="q"></form>
</section>
`;

export function pageEditor(files: Record<string, string> = { "index.liquid": PAGE }, extensions: Extension[] = []): TestEditor {
  return createTestEditor({ files, extensions: [htmlKit(), tailwindKit(), editorKit(), ...extensions] });
}

/** The inspector rendered with the default slots. */
export function inspector(e: TestEditor, extra?: ReactNode): Rendered {
  return render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>
        <Inspector />
        {extra}
      </ComponentsProvider>
    </EditorStoreProvider>,
  );
}

export const select = (e: TestEditor, sel: string) => act(() => e.select(e.get(sel)));
export const inspectorUi = (e: TestEditor) => e.state.field(inspectorField);
export const section = (r: Rendered, id: string) => r.container.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
export const header = (r: Rendered, id: string) => section(r, id)!.querySelector<HTMLElement>('[role="button"]')!;
export const wait = (ms: number) => act(() => new Promise<void>((res) => setTimeout(res, ms)));
