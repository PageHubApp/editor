/**
 * Whether a selection handle (resize, padding, gap, rotate: `NodeTools`) is being dragged, per
 * editor store. Chrome that steps aside during the gesture (the selection actions) reads it with
 * `useHandleDragging()`; `NodeTools` sets it on start and clears it on end.
 */
import { useSyncExternalStore } from "react";
import { useEditorStore } from "../../react/bindings";

class HandleDrag {
  private on = false;
  private readonly listeners = new Set<() => void>();
  get = (): boolean => this.on;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  set(on: boolean): void {
    if (this.on === on) return;
    this.on = on;
    for (const fn of this.listeners) fn();
  }
}

const flags = new WeakMap<object, HandleDrag>();

export function handleDragOf(store: object): HandleDrag {
  let f = flags.get(store);
  if (!f) flags.set(store, (f = new HandleDrag()));
  return f;
}

export function useHandleDragging(): boolean {
  const f = handleDragOf(useEditorStore());
  return useSyncExternalStore(f.subscribe, f.get, f.get);
}
