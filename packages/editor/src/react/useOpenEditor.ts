/**
 * Open a core from a storage for `<Editor storage=…>`: `createEditor` with the host's
 * extensions (default HTML + Tailwind + Liquid) plus `editorKit()`, destroyed on unmount.
 * Returns null while opening; an open failure is thrown from render (an error boundary or the
 * host's `onError` sees it).
 */
import { useEffect, useState } from "react";
import { createEditor, type CreateEditorOptions, type Editor as Core, type Extension } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { editorKit } from "../state/uiState";

export type OpenOptions = Pick<CreateEditorOptions, "storage" | "role" | "data" | "identity" | "blockProvenance"> & { extensions?: Extension };

export function useOpenEditor(opts: OpenOptions | null, onReady?: (editor: Core) => void): Core | null {
  const [state, setState] = useState<{ editor: Core | null; error: unknown }>({ editor: null, error: null });
  const { storage, role, data, identity, blockProvenance, extensions } = opts ?? ({} as Partial<OpenOptions>);
  const enabled = opts !== null;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let opened: Core | null = null;
    createEditor({ storage: storage!, role, data, identity, blockProvenance, extensions: [extensions ?? [htmlKit(), tailwindKit(), liquidKit()], editorKit()] }).then(
      (editor) => {
        if (cancelled) return editor.destroy();
        opened = editor;
        setState({ editor, error: null });
        onReady?.(editor);
      },
      (error) => !cancelled && setState({ editor: null, error }),
    );
    return () => {
      cancelled = true;
      opened?.destroy();
      setState({ editor: null, error: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reopen only when the source of truth changes
  }, [enabled, storage, role, data, identity, extensions]);
  if (state.error) throw state.error;
  return state.editor;
}
