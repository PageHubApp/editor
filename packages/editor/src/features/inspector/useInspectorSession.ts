/**
 * The inspector's session state (`inspectorField`) as hooks: rows added this session per
 * element, the requested-open popover row, and the search. Every write is `inspector.set`.
 */
import { useCallback } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { elementKey, inspectorField, type InspectorUi } from "./inspectorState";

export function useInspectorUi<T>(select: (i: InspectorUi) => T, equals?: (a: T, b: T) => boolean): T {
  return useEditorState((s) => select(s.field(inspectorField)), equals);
}

const NONE: readonly string[] = [];

/** Rows added this session on `h`, in click order. */
export function useAddedRows(h: NodeHandle | null): readonly string[] {
  return useInspectorUi((i) => (h ? (i.added[elementKey(h)] ?? NONE) : NONE));
}

export function useInspectorActions() {
  const store = useEditorStore();
  const set = useCallback((patch: Partial<InspectorUi>) => store.run("inspector.set", patch), [store]);
  return {
    set,
    /** Keep rows visible for the session (after "+" or a clear). */
    addRows: useCallback(
      (h: NodeHandle, ids: readonly string[]) => {
        const k = elementKey(h);
        const cur = store.state.field(inspectorField).added[k] ?? NONE;
        const next = [...cur, ...ids.filter((id) => !cur.includes(id))];
        if (next.length !== cur.length) set({ added: { ...store.state.field(inspectorField).added, [k]: next } });
      },
      [store, set],
    ),
    openRow: useCallback((h: NodeHandle | null, id: string | null) => set({ openRow: h && id ? `${elementKey(h)}:${id}` : null }), [set]),
  };
}

/** Whether `row` on `h` has its popover open. */
export function useRowOpen(h: NodeHandle | null, rowId: string): boolean {
  return useInspectorUi((i) => !!h && i.openRow === `${elementKey(h)}:${rowId}`);
}
