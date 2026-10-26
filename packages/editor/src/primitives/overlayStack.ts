/**
 * The overlay stack: a LIFO of dismissable chrome surfaces (popovers, floating panels, modals,
 * menus). A surface registers while open with `useOverlay({ id, isOpen, onDismiss })`; Escape
 * dismisses only the top one.
 *
 * Escape order: the keymap's `overlay.dismissTop` binding runs at a higher precedence than
 * `selection.clear`, so Esc closes the top overlay first and clears the
 * selection only when nothing is open. The stack has no key listener of its own: Escape reaches
 * it through the one DOM keymap (`attachKeymap`), the single Escape path for every surface.
 *
 *   useOverlay({ id: "color-panel", isOpen: open, onDismiss: () => setOpen(false) });
 */
import { useEffect, useRef } from "react";

interface OverlayEntry {
  id: string;
  dismiss(): void;
}

const stack: OverlayEntry[] = [];

/** Push (or move to the top) an overlay. */
export function pushOverlay(entry: OverlayEntry): void {
  const i = stack.findIndex((e) => e.id === entry.id);
  if (i >= 0) stack.splice(i, 1);
  stack.push(entry);
}

/** Remove an overlay; unknown ids are ignored. */
function popOverlay(id: string): void {
  const i = stack.findIndex((e) => e.id === id);
  if (i < 0) return;
  stack.splice(i, 1);
}

export const overlayDepth = (): number => stack.length;

/** Pop the top overlay and call its dismiss. False when nothing is open. */
export function dismissTopOverlay(): boolean {
  const entry = stack.pop();
  if (!entry) return false;
  entry.dismiss();
  return true;
}

/** Tests only. */
export function resetOverlaysForTests(): void {
  stack.length = 0;
}

/** Register a surface on the stack while `isOpen`. The latest `onDismiss` is always called. */
export function useOverlay({ id, isOpen, onDismiss }: { id: string; isOpen: boolean; onDismiss: () => void }): void {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEffect(() => {
    if (!isOpen) return;
    pushOverlay({ id, dismiss: () => latest.current() });
    return () => popOverlay(id);
  }, [id, isOpen]);
}
