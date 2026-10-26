/**
 * Whether the main canvas is waiting on a render, and which page it last painted. The canvas frame
 * writes it; the page pill reads it (busy until the NEW page paints). One status per editor store.
 */
import { useSyncExternalStore } from "react";
import type { Path, Store } from "@pagehub/engine";

interface RenderStatus {
  pending: boolean;
  /** The page last written into the frame (null before the first paint). */
  painted: Path | null;
  /** Counts paints, so a panel that reads the frame's document re-reads it after every one. */
  version: number;
  /** The first render has painted (fonts and styles applied) or failed: the canvas shows something real or an error, never nothing. */
  settled: boolean;
}

const IDLE: RenderStatus = { pending: false, painted: null, version: 0, settled: false };
const statuses = new WeakMap<object, RenderStatus>();
const listeners = new WeakMap<object, Set<() => void>>();

export function setRenderStatus(store: Store, patch: Partial<RenderStatus>): void {
  const prev = statuses.get(store) ?? IDLE;
  const next = { ...prev, ...patch };
  if (next.pending === prev.pending && next.painted === prev.painted && next.version === prev.version && next.settled === prev.settled) return;
  statuses.set(store, next);
  listeners.get(store)?.forEach((l) => l());
}

export function useRenderStatus(store: Store): RenderStatus {
  return useSyncExternalStore(
    (cb) => {
      const set = listeners.get(store) ?? new Set<() => void>();
      listeners.set(store, set);
      set.add(cb);
      return () => void set.delete(cb);
    },
    () => statuses.get(store) ?? IDLE,
  );
}
