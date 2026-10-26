/**
 * Swipe the sidebar shut from its inner edge (the 32px facing the canvas). Form controls and
 * `[data-no-swipe-close]` never start it, nor do portalled popovers (not DOM descendants). The
 * gesture locks horizontal after 6px of mostly-horizontal travel (abandoned once vertical
 * travel passes 24px at 1.5× the horizontal); while dragging the panel follows the pointer.
 * Release closes at ≥ 50px, or ≥ 25px at ≥ 0.3px/ms; otherwise it springs back over 180ms.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const SWIPE_EDGE_PX = 32;
const SWIPE_CLOSE_PX = 50;
const SWIPE_FLICK_PX = 25;
const SWIPE_FLICK_SPEED = 0.3;
const SPRING_MS = 180;
const IGNORE = "input, textarea, select, [role='slider'], [contenteditable='true'], [data-no-swipe-close]";

export function useSidebarSwipe(aside: RefObject<HTMLElement | null>, opts: { enabled: boolean; left: boolean; onClose(): void }): { onPointerDown(e: ReactPointerEvent): void } {
  const cfg = useRef(opts);
  cfg.current = opts;
  const detach = useRef<(() => void) | null>(null);
  useEffect(() => () => detach.current?.(), []);

  return {
    onPointerDown(e) {
      const el = aside.current;
      const target = e.target as HTMLElement | null;
      if (!cfg.current.enabled || !el || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (target?.closest?.(IGNORE) || (target && !el.contains(target))) return;
      const rect = el.getBoundingClientRect();
      const fromEdge = cfg.current.left ? rect.right - e.clientX : e.clientX - rect.left;
      if (fromEdge > SWIPE_EDGE_PX) return;
      const start = { x: e.clientX, y: e.clientY, t: performance.now() };
      const dir = cfg.current.left ? -1 : 1;
      let decided: "h" | "v" | null = null;
      let dx = 0;
      const end = (commit: boolean) => {
        detach.current?.();
        if (decided !== "h") return void Object.assign(el.style, { transition: "", transform: "" });
        const travel = dx * dir;
        const speed = travel / Math.max(performance.now() - start.t, 1);
        if (commit && (travel >= SWIPE_CLOSE_PX || (travel >= SWIPE_FLICK_PX && speed >= SWIPE_FLICK_SPEED))) {
          el.style.transition = "";
          cfg.current.onClose();
          setTimeout(() => (el.style.transform = ""), 260);
        } else {
          el.style.transition = `transform ${SPRING_MS}ms ease-out`;
          el.style.transform = "";
          setTimeout(() => (el.style.transition = ""), SPRING_MS + 20);
        }
      };
      const onMove = (ev: PointerEvent) => {
        if (ev.buttons === 0 && ev.pointerType === "mouse") return end(true);
        const mx = ev.clientX - start.x;
        const my = ev.clientY - start.y;
        if (decided === null) {
          if (Math.abs(my) > 24 && Math.abs(my) > Math.abs(mx) * 1.5) {
            decided = "v";
            return end(false);
          }
          if (Math.abs(mx) < 6 || Math.abs(mx) < Math.abs(my)) return;
          decided = "h";
        }
        ev.preventDefault();
        dx = mx;
        const travel = dx * dir;
        el.style.transition = "none";
        el.style.transform = travel > 0 ? `translateX(${dir * Math.min(travel, 360)}px)` : "";
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
      detach.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onCancel);
        detach.current = null;
      };
    },
  };
}
