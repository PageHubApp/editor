// A right-docked slide-out: a flex sibling of the canvas column, so it pushes the canvas instead
// of floating over it. The editor owns it while staying aware of any host sidebars docked to its
// right (see `rightDockOffset` on `<Editor>` / `docs/right-drawer.md`).
/**
 * Drawer — a right-docked slide-out panel, full editor-row height, one open at a time. It lives
 * in the shell's main row as the last flex child; its width animates 0 ↔ `width` so the canvas
 * column (flex-1) gives up / reclaims the space with it, and it never overlaps the canvas.
 *
 *   <Drawer open={panel === "theme"} onClose={close} title="Theme" width={360} scrollable>…</Drawer>
 *
 * - Dismiss: Esc through the overlay stack (LIFO) and the header's Close button.
 * - `scrollable` wraps the body in a padded, scrolling column (Theme / Modifiers); Media scrolls
 *   itself, so it gets the raw flex body.
 * - Stays mounted while closed (width 0, inert) so it can slide out; the region unmounts the body
 *   itself on close (one panel at a time).
 */
import { type ReactNode } from "react";
import { useOverlay } from "./overlayStack";
import { Icon } from "./icons";
import { AutoHideScrollbar } from "./AutoHideScrollbar";

export interface DrawerProps {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  /** Overlay-stack id (Esc dismisses the top overlay). */
  id?: string;
  /** Open width in px; the body is this wide and the whole panel slides in as the width animates. */
  width?: number;
  /** Wrap the body in a padded, scrolling column (Theme / Modifiers). Media scrolls itself. */
  scrollable?: boolean;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, id = "right-drawer", width = 360, scrollable, children }: DrawerProps) {
  useOverlay({ id, isOpen: open, onDismiss: onClose });
  return (
    <aside
      data-ph-right-drawer={id}
      data-open={open}
      aria-hidden={!open}
      aria-label={typeof title === "string" ? title : undefined}
      style={{ width: open ? width : 0 }}
      className={`border-base-300 bg-base-100 relative z-[60] flex h-full shrink-0 grow-0 flex-col overflow-hidden border-l shadow-xl transition-[width] duration-300 ease-out ${open ? "" : "pointer-events-none"}`}
    >
      {/* Fixed-width body so the content doesn't reflow while the panel slides. */}
      <div style={{ width }} className="flex h-full min-h-0 flex-col">
        <div className="border-base-300 flex min-h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
          <span className="text-base-content truncate text-xs font-semibold">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-base-content/70 hover:bg-base-200 hover:text-base-content rounded p-1 transition-colors">
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
        {scrollable ? (
          <AutoHideScrollbar className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 p-3">{children}</div>
          </AutoHideScrollbar>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        )}
      </div>
    </aside>
  );
}
