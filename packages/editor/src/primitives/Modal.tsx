/**
 * Modal — the one centred / drawer / bottom-sheet dialog shell (not draggable: that is
 * `FloatingPanel`). Backdrop, motion, Escape (top of the overlay stack only), focus trap,
 * scroll lock and `role="dialog"` behave the same for every dialog.
 *
 *   <Modal isOpen={open} onClose={close} title="Insert image" size="lg">…</Modal>
 *
 * Backdrop: Chrome doesn't draw `backdrop-filter` on an element that is mid-way through an
 * opacity fade, so the tint layer fades opacity (no blur) and a separate blur layer stays at
 * opacity 1 and animates its radius.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap, useScrollLock } from "./a11y";
import { Icon } from "./icons";
import { useOverlay } from "./overlayStack";
import { usePortalTarget } from "./portal";
import { Z_MODAL } from "./zIndex";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full" | "palette";
export type ModalVariant = "centered" | "drawer-right" | "drawer-left" | "sheet-bottom";

const MODAL_DURATION_MS = 250;
const EASING = "cubic-bezier(0.19, 1, 0.22, 1)";

const SIZE_WIDTH: Record<ModalSize, string> = { sm: "w-full max-w-sm", md: "w-full max-w-lg", lg: "w-full max-w-2xl", xl: "w-full max-w-4xl", full: "w-full max-w-none", palette: "w-[600px] max-w-[92vw]" };
const HIDDEN_TRANSFORM: Record<ModalVariant, string> = { centered: "translateY(8px) scale(0.98)", "drawer-right": "translateX(24px)", "drawer-left": "translateX(-24px)", "sheet-bottom": "translateY(100%)" };
const POSITIONER: Record<ModalVariant, string> = {
  centered: "items-center justify-center p-4",
  "drawer-right": "items-stretch justify-end p-4",
  "drawer-left": "items-stretch justify-start p-4",
  // the gap above the sheet keeps the page peeking out
  "sheet-bottom": "items-end justify-center px-0 pb-0 pt-4 sm:px-3 sm:pt-12",
};

/**
 * `mounted` stays true for the exit transition; `shown` flips two frames after mount (the first
 * paints the closed state to transition from). Duration 0 under reduced motion.
 */
function usePresence(isOpen: boolean) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const duration = reduced ? 0 : MODAL_DURATION_MS;
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      let second = 0;
      const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setShown(true))));
      return () => (cancelAnimationFrame(first), cancelAnimationFrame(second));
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(t);
  }, [isOpen, duration]);
  return { mounted: mounted || isOpen, shown: shown && isOpen, duration };
}

export interface ModalProps {
  isOpen: boolean;
  /** Escape, backdrop click and the header close button. */
  onClose?(): void;
  /** Overlay-stack id; generated when omitted. */
  id?: string;
  /** Header bar (with `surface`) and the accessible name. */
  title?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  role?: "dialog" | "alertdialog";
  size?: ModalSize;
  variant?: ModalVariant;
  /** `top`: a centred dialog that hangs 18vh from the top (the command palette). */
  align?: "center" | "top";
  /** Escape + backdrop dismiss (default true). */
  dismissable?: boolean;
  closeOnBackdrop?: boolean;
  zIndex?: number;
  /** true: the shell draws the card; false: children draw their own. */
  surface?: boolean;
  tintClassName?: string;
  /** Backdrop blur in px; 0 for none. */
  blur?: number;
  className?: string;
  positionerClassName?: string;
  children: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  id,
  title,
  ariaLabel,
  ariaLabelledBy,
  role = "dialog",
  size = "md",
  variant = "centered",
  align = "center",
  dismissable = true,
  closeOnBackdrop = dismissable,
  zIndex = Z_MODAL,
  surface = true,
  tintClassName = "bg-base-100/75",
  blur = 8,
  className = "",
  positionerClassName = "",
  children,
}: ModalProps) {
  const generated = useId();
  const { mounted, shown, duration } = usePresence(isOpen);
  const trapRef = useFocusTrap(isOpen);
  useScrollLock(isOpen);
  const target = usePortalTarget();
  const close = () => onClose?.();
  useOverlay({ id: id ?? `modal:${generated}`, isOpen: isOpen && dismissable, onDismiss: close });

  if (!mounted || !target) return null;
  const transition = (props: string) => props.split(",").map((p) => `${p.trim()} ${duration}ms ${EASING}`).join(", ");
  const onBackdrop = closeOnBackdrop ? close : undefined;
  const isSheet = variant === "sheet-bottom";
  const shape = isSheet ? "h-full max-h-none w-full max-w-none rounded-t-2xl rounded-b-none" : variant !== "centered" || size === "full" ? "h-full max-h-none rounded-none" : "max-h-[90vh] rounded-box";

  return createPortal(
    <>
      {blur > 0 && (
        <div
          aria-hidden="true"
          data-modal-backdrop=""
          className="fixed inset-0"
          style={{ zIndex: zIndex - 1, backdropFilter: `blur(${shown ? blur : 0}px)`, WebkitBackdropFilter: `blur(${shown ? blur : 0}px)`, transition: transition("backdrop-filter, -webkit-backdrop-filter") }}
          onClick={onBackdrop}
        />
      )}
      <div aria-hidden="true" data-modal-backdrop="" className={`fixed inset-0 ${tintClassName}`} style={{ zIndex: zIndex - 1, opacity: shown ? 1 : 0, transition: transition("opacity") }} onClick={onBackdrop} />
      {/* clicks outside the panel fall through the positioner to the backdrop */}
      <div className={`pagehub-editor pointer-events-none fixed inset-0 flex ${align === "top" && variant === "centered" ? "items-start justify-center px-4 pt-[18vh]" : POSITIONER[variant]} ${positionerClassName}`} style={{ zIndex }}>
        <div
          ref={trapRef}
          role={role}
          aria-modal="true"
          aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? title)}
          aria-labelledby={ariaLabelledBy}
          className={`pointer-events-auto ${surface ? `ph-modal-surface border-base-300 bg-base-100 border shadow-xl text-base-content flex flex-col overflow-hidden ${SIZE_WIDTH[size]} ${shape}` : ""} ${className}`}
          style={{
            animation: "none",
            // a sheet slides all the way in; fading it too looks washed out
            opacity: shown || isSheet ? 1 : 0,
            transform: shown ? "none" : HIDDEN_TRANSFORM[variant],
            transition: transition("opacity, transform"),
          }}
        >
          {surface && title !== undefined && (
            <div className="border-base-300 flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">{title}</span>
              <button type="button" onClick={close} aria-label="Close" className="hover:bg-base-200 rounded p-1 transition-colors">
                <Icon name="x" className="size-4" />
              </button>
            </div>
          )}
          {surface ? <div className="min-h-0 flex-1 overflow-auto">{children}</div> : children}
        </div>
      </div>
    </>,
    target,
  );
}
