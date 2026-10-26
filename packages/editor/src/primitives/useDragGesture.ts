/**
 * The one pointer-gesture primitive (drag, resize, sliders). On a primary-button pointerdown it
 * attaches `pointermove` / `pointerup` / `pointercancel` / `blur` to `window` and detaches them
 * on end — never React pointer props, which strand the gesture when the up event is missed.
 * A move with no buttons held counts as the end; unmounting mid-gesture ends it too, so
 * side effects set in `onStart` (body cursor) are always undone.
 *
 *   const { onPointerDown } = useDragGesture({ onMove: (_e, m) => setX(x0 + m.dx), onEnd: save });
 *   <div onPointerDown={onPointerDown} />
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { holdAutosave } from "../features/save/saveHolds";

interface DragMove {
  /** From the pointerdown, in screen pixels. */
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
}

interface DragGestureOptions {
  /** After the primary-button check. Return false to not start. */
  onStart?(e: ReactPointerEvent): boolean | void;
  onMove?(e: PointerEvent, m: DragMove): void;
  /** Exactly once: up, cancel, blur, a buttonless move, or unmount. */
  onEnd?(e: PointerEvent | null, moved: boolean): void;
  /** Pixels before `moved` turns true. Default 1. */
  threshold?: number;
}

export function useDragGesture(options: DragGestureOptions): { onPointerDown(e: ReactPointerEvent): void } {
  const opts = useRef(options);
  opts.current = options;
  const active = useRef<{ x: number; y: number; moved: boolean; release(): void; detach(): void } | null>(null);

  const finish = useCallback((e: PointerEvent | null) => {
    const a = active.current;
    if (!a) return;
    active.current = null;
    a.detach();
    a.release();
    opts.current.onEnd?.(e, a.moved);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      finish(null);
      if (opts.current.onStart?.(e) === false) return;
      const threshold = opts.current.threshold ?? 1;
      const move = (ev: PointerEvent) => {
        const a = active.current;
        if (!a) return;
        if (ev.buttons === 0) return finish(ev);
        const dx = ev.clientX - a.x;
        const dy = ev.clientY - a.y;
        if (!a.moved && Math.hypot(dx, dy) >= threshold) a.moved = true;
        opts.current.onMove?.(ev, { dx, dy, clientX: ev.clientX, clientY: ev.clientY });
      };
      const end = (ev: PointerEvent) => finish(ev);
      const blur = () => finish(null);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      window.addEventListener("blur", blur);
      active.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        release: holdAutosave(),
        detach() {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          window.removeEventListener("blur", blur);
        },
      };
    },
    [finish],
  );

  useEffect(() => () => finish(null), [finish]);
  return { onPointerDown };
}
