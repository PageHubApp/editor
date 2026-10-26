/**
 * The drag in progress, shared by everything that starts or shows one: the canvas, the layers
 * panel, the insert panel and the drop indicator. One session per editor store. The canvas
 * registers itself as the drop surface, so a drag that starts in a panel drops on the canvas
 * through the same plan and commands as a drag that starts on the canvas.
 */
import { useSyncExternalStore } from "react";
import type { NodeHandle } from "@pagehub/engine";
import type { InsertArgs } from "@pagehub/engine/kits";
import { useEditorStore } from "../../react/bindings";
import type { DropPlan } from "./dropPlan";

export type DragSource =
  | { kind: "existing"; handles: readonly NodeHandle[] }
  | { kind: "new"; insert: InsertArgs; label?: string; preview?: HTMLElement };

export interface DragState {
  source: DragSource;
  /** Where the drag started and where the pointer is (client coordinates of the host page). */
  origin: { x: number; y: number };
  pointer: { x: number; y: number };
  /** Shift held at the start or at any time since: copy instead of move. */
  copy: boolean;
  plan: DropPlan | null;
}

/** A place a drag can land (the canvas). */
interface DropSurface {
  /** The plan for the current pointer, or null when it is outside the surface. */
  plan(state: DragState): DropPlan | null;
  /** Run the plan's command (one transaction). */
  drop(plan: DropPlan): boolean;
  /** Called when the session starts and ends (drag flags, preview). */
  started?(state: DragState): void;
  ended?(): void;
}

class DragSession {
  private current: DragState | null = null;
  private readonly listeners = new Set<() => void>();
  surface: DropSurface | null = null;

  get = (): DragState | null => this.current;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  start(source: DragSource, x: number, y: number, copy: boolean): void {
    this.current = { source, origin: { x, y }, pointer: { x, y }, copy, plan: null };
    this.surface?.started?.(this.current);
    this.emit();
  }

  /** Swap the markup of a new-element drag (a block whose source arrived after the drag started). */
  setInsert(insert: InsertArgs): void {
    const c = this.current;
    if (!c || c.source.kind !== "new" || c.source.insert === insert) return;
    this.current = { ...c, source: { ...c.source, insert } };
  }

  /** A pointer move (client coordinates); Shift latches copy mode. */
  move(x: number, y: number, shift: boolean): void {
    const c = this.current;
    if (!c) return;
    const next = { ...c, pointer: { x, y }, copy: c.copy || shift };
    this.current = { ...next, plan: this.surface?.plan(next) ?? null };
    this.emit();
  }

  setCopy(copy: boolean): void {
    if (!this.current || this.current.copy === copy) return;
    this.current = { ...this.current, copy };
    this.move(this.current.pointer.x, this.current.pointer.y, copy);
  }

  /** End the drag: drop when `commit` and the plan is valid. Returns whether it dropped. */
  end(commit: boolean): boolean {
    const c = this.current;
    this.current = null;
    this.surface?.ended?.();
    const dropped = !!(commit && c?.plan?.valid && this.surface?.drop(c.plan));
    this.emit();
    return dropped;
  }
}

const sessions = new WeakMap<object, DragSession>();

export function dragSessionOf(store: object): DragSession {
  let s = sessions.get(store);
  if (!s) sessions.set(store, (s = new DragSession()));
  return s;
}

export function useDragSession(): DragState | null {
  const session = dragSessionOf(useEditorStore());
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
