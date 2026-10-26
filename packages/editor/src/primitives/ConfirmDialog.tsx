/**
 * ConfirmDialog — the only way the chrome asks before acting (never `confirm()` / `alert()`).
 * Usually through `useConfirm()`:
 *
 *   const { ask, dialog } = useConfirm();
 *   if (!(await ask({ title: "Delete this animation?", message: "…", confirmText: "Delete" }))) return;
 *   …
 *   return <>{…}{dialog}</>;
 *
 * Resolves true on confirm, false on cancel / Esc / backdrop. Asking again while open resolves
 * the earlier question false. Sits above every panel (`Z_CONFIRM`).
 */
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { announce } from "./a11y";
import { Icon } from "./icons";
import { Modal } from "./Modal";
import { Z_CONFIRM } from "./zIndex";

export type ConfirmVariant = "danger" | "warning" | "info" | "success";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: ReactNode;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  isOpen: boolean;
  onClose(): void;
  onConfirm(): void;
}

// Per-variant icon and confirm-button classes, from theme tokens.
const VARIANT: Record<ConfirmVariant, { icon: string; confirm: string }> = {
  danger: { icon: "bg-error/15 text-error", confirm: "bg-error text-error-content hover:bg-error/90" },
  warning: { icon: "bg-warning/15 text-warning", confirm: "bg-warning text-warning-content hover:bg-warning/90" },
  info: { icon: "bg-info/15 text-info", confirm: "bg-info text-info-content hover:bg-info/90" },
  success: { icon: "bg-success/15 text-success", confirm: "bg-success text-success-content hover:bg-success/90" },
};

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", variant = "danger", icon }: ConfirmDialogProps) {
  const titleId = useId();
  const v = VARIANT[variant];
  const confirm = () => {
    onConfirm();
    onClose();
    announce(`${title} confirmed`, "assertive");
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} role="alertdialog" ariaLabelledBy={titleId} zIndex={Z_CONFIRM} surface={false} className="border-base-300 bg-base-100 w-full max-w-md overflow-hidden rounded-xl border shadow-xl">
      <div className="p-6">
        <div className="mb-4 flex items-start gap-4">
          <div className={`${v.icon} shrink-0 rounded-full p-3`}>{icon ?? <Icon name={variant === "success" ? "check" : "alert-triangle"} className="size-6" />}</div>
          <div className="flex-1">
            <h3 id={titleId} className="text-base-content mb-2 text-lg font-semibold">
              {title}
            </h3>
            <p className="text-base-content/70 text-sm">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} data-confirm="cancel" className="border-base-300 text-base-content/70 hover:bg-base-200 hover:text-base-content rounded-lg border px-4 py-2 text-sm font-medium transition-colors">
            {cancelText}
          </button>
          <button type="button" onClick={confirm} data-confirm="ok" className={`${v.confirm} rounded-lg px-4 py-2 text-sm font-medium transition-colors`}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function useConfirm(): { ask(options: ConfirmOptions): Promise<boolean>; dialog: ReactNode } {
  // kept after close so the text stays while the dialog fades out
  const [options, setOptions] = useState<ConfirmOptions>({ title: "", message: "" });
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);
  const ask = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => void (resolver.current = resolve));
  }, []);
  return { ask, dialog: <ConfirmDialog {...options} isOpen={open} onConfirm={() => settle(true)} onClose={() => settle(false)} /> };
}
