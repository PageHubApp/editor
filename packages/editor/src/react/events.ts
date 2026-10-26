/**
 * Host-facing editor events (`onEvent`): `selection` and `diff` come from the editor state
 * (any core), `change` (the text changed and went quiet for 500ms, with the paths a save would
 * write), `saved` and `conflict` from `createEditor`'s `on()`. `diff` fires on every change.
 */
import { useEffect, useRef } from "react";
import type { Editor as Core, FileDiff, NodeHandle, Store } from "@pagehub/engine";

export type EditorEvent =
  | { type: "saved"; written: string[] }
  | { type: "conflict"; path: string; theirs: string; version: string }
  | { type: "selection"; handles: readonly NodeHandle[]; primary: NodeHandle | null }
  | { type: "diff"; files: FileDiff[] }
  | { type: "change"; dirty: string[] };

export const isCore = (s: Store): s is Core => typeof (s as Core).on === "function" && typeof (s as Core).pendingDiff === "function";

/** Forward the editor's events to `onEvent` for as long as the component is mounted. */
export function useEditorEvents(editor: Store, onEvent: ((e: EditorEvent) => void) | undefined): void {
  const latest = useRef(onEvent);
  latest.current = onEvent;
  useEffect(() => {
    const emit = (e: EditorEvent) => latest.current?.(e);
    const off = [
      editor.subscribe((s) => s.selection, (sel) => emit({ type: "selection", handles: sel.handles, primary: sel.primary })),
    ];
    if (isCore(editor)) {
      off.push(
        editor.subscribe((s) => s.files, () => emit({ type: "diff", files: editor.pendingDiff() })),
        editor.on("change", (e) => emit({ type: "change", dirty: e.dirty })),
        editor.on("saved", (e) => emit({ type: "saved", written: e.written })),
        editor.on("conflict", (e) => emit({ type: "conflict", ...e })),
      );
    }
    return () => off.forEach((f) => f());
  }, [editor]);
}
