/** Render helper for the pickers and media tests: `<Editor>`'s providers with chosen slots swapped in. */
import type { ReactNode } from "react";
import type { TestEditor } from "@pagehub/engine/testing";
import { ComponentsProvider, type ComponentsMap } from "../src/components.ts";
import { DEFAULT_COMPONENTS } from "../src/index.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";

export function withSlots(e: TestEditor, slots: Partial<ComponentsMap>, ui: ReactNode): ReactNode {
  return (
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={{ ...DEFAULT_COMPONENTS, ...slots }}>{ui}</ComponentsProvider>
    </EditorStoreProvider>
  );
}

export const flush = () => new Promise<void>((r) => setTimeout(r, 0));
