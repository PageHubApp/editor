/**
 * `useCommit()` → `commit(command, args)`: run the command, then close the history group, so
 * each panel change is its own undo step even when the next one (same command, another
 * field) follows within the 500 ms merge window.
 */
import { useCallback } from "react";
import { closeHistoryGroup, type NodeHandle } from "@pagehub/engine";
import { useEditorStore } from "../../react/bindings";

export type Commit = (command: string, args: Record<string, unknown>) => boolean;

export function useCommit(): Commit {
  const store = useEditorStore();
  return useCallback(
    (command, args) => {
      const ok = store.run(command, args);
      if (ok) store.dispatch((tr) => tr.effect(closeHistoryGroup, null));
      return ok;
    },
    [store],
  );
}

/** `commit` bound to one handle (`at`). */
export function useCommitAt(handle: NodeHandle): (command: string, args?: Record<string, unknown>) => boolean {
  const commit = useCommit();
  return useCallback((command, args = {}) => commit(command, { ...args, at: handle }), [commit, handle]);
}
