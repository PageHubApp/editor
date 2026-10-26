/** Focus trap, scroll lock and a polite / assertive live-region announcer for dialogs. */
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Keep Tab inside the element while `active`; focus its first control (unless something inside
 * already took focus, e.g. an autoFocus search); restore the previous focus on close.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const raf = requestAnimationFrame(() => {
      if (!el.contains(document.activeElement)) focusable()[0]?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusable();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) (last.focus(), e.preventDefault());
      else if (!e.shiftKey && document.activeElement === last) (first.focus(), e.preventDefault());
    };
    el.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [active]);
  return ref;
}

/** Lock page scroll while `active` (nested locks restore in order). */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = "hidden";
    return () => void (body.style.overflow = before);
  }, [active]);
}

/** Announce a message to screen readers through a shared, visually hidden live region. */
export function announce(message: string, politeness: "polite" | "assertive" = "polite"): void {
  if (typeof document === "undefined") return;
  const id = `pagehub-editor-live-${politeness}`;
  let region = document.getElementById(id);
  if (!region) {
    region = document.createElement("div");
    region.id = id;
    region.setAttribute("aria-live", politeness);
    region.setAttribute("role", politeness === "assertive" ? "alert" : "status");
    region.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
    document.body.appendChild(region);
  }
  region.textContent = "";
  region.textContent = message;
}

/**
 * Calls `fn` when focus moves into an iframe (a press inside the canvas never reaches this
 * document's listeners; the window blurs and the iframe becomes the active element). Returns the
 * unsubscribe. How popovers dismiss on a click into the canvas.
 */
export function onFrameFocus(fn: () => void): () => void {
  const handler = () => void (document.activeElement instanceof HTMLIFrameElement && fn());
  window.addEventListener("blur", handler);
  return () => window.removeEventListener("blur", handler);
}
