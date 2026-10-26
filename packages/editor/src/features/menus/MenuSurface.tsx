/**
 * The right-click menu shell: a fixed panel at the pointer, kept 8px inside the window,
 * closed by an outside pointer-down (the right button doesn't count) or Esc through the
 * overlay stack. `MENU_ITEM` is the row style every menu shares.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../../primitives/overlayStack";
import { OVERLAY_ROOT_CLASS, usePortalTarget } from "../../primitives/portal";
import { Z_MENU } from "../../primitives/zIndex";

export const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function MenuDivider() {
  return <div className="border-base-300 my-1 border-t" aria-hidden />;
}

export interface MenuSurfaceProps {
  at: { x: number; y: number } | null;
  /** Overlay-stack id. */
  id: string;
  ariaLabel: string;
  onClose(): void;
  /** Assumed size for the clamp. */
  width?: number;
  height?: number;
  children: ReactNode;
}

export function MenuSurface({ at, id, ariaLabel, onClose, width = 228, height = 248, children }: MenuSurfaceProps) {
  const root = useRef<HTMLDivElement>(null);
  const open = !!at;
  useOverlay({ id, isOpen: open, onDismiss: onClose });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => e.button !== 2 && !root.current?.contains(e.target as Node) && onClose();
    // a press inside an iframe (the canvas) never reaches the host document, so listen in each one too
    const docs = [document, ...[...document.querySelectorAll("iframe")].map((f) => f.contentDocument).filter((d): d is Document => !!d)];
    for (const d of docs) d.addEventListener("mousedown", onDown, true);
    return () => docs.forEach((d) => d.removeEventListener("mousedown", onDown, true));
  }, [open, onClose]);
  const target = usePortalTarget();
  if (!at || !target) return null;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - width));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - height));
  return createPortal(
    <div ref={root} role="menu" aria-label={ariaLabel} style={{ left, top, zIndex: Z_MENU }} className={`${OVERLAY_ROOT_CLASS} border-base-300/50 bg-base-100 text-base-content fixed min-w-[12rem] rounded-xl border py-1 shadow-xl select-none`}>
      {children}
    </div>,
    target,
  );
}
