/**
 * ListboxPopover — a field's option list (autocomplete, value-type menu, suggestions). Always
 * portalled through `AnchoredPopover` to the floating layer, so a field inside a scrolling
 * popover or panel never has its list clipped; collision-aware (flip / shift), at least as wide as
 * the anchor and as wide as its widest option (labels never wrap), height capped to the space
 * available.
 *
 *   <ListboxPopover open={auto} anchor={fieldRef} onOpenChange={setAuto} data-unified-dropdown="">
 *     <li role="option">…</li>
 *   </ListboxPopover>
 *
 * Presses in it count as inside every enclosing AnchoredPopover / FloatingPanel. `dismiss`
 * defaults to off: the field owns closing (blur, Esc on its own overlay entry).
 */
import type { ReactNode, RefObject } from "react";
import type { Placement } from "@floating-ui/react-dom";
import { AnchoredPopover } from "./AnchoredPopover";
import { Z_LISTBOX } from "./zIndex";

export interface ListboxPopoverProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  anchor: RefObject<HTMLElement | null>;
  placement?: Placement;
  /** Max height in px (default 192). */
  maxHeight?: number;
  /** Let the popover close itself on an outside press / Esc (default: the field does it). */
  dismiss?: boolean;
  role?: "listbox" | "menu";
  id?: string;
  ariaLabel?: string;
  /** Marker attribute for blur checks (`data-unified-dropdown`, …). */
  marker: string;
  className?: string;
  /** Replaces the default surface (`ph-panel bg-base-100 p-1`). */
  surface?: string;
  children: ReactNode;
}

export function ListboxPopover({ open, onOpenChange, anchor, placement = "bottom-start", maxHeight = 192, dismiss = false, role = "listbox", id, ariaLabel, marker, className = "", surface, children }: ListboxPopoverProps) {
  return (
    <AnchoredPopover open={open} onOpenChange={onOpenChange} anchor={anchor} placement={placement} fitContent={maxHeight} zIndex={Z_LISTBOX} immediate disableDismiss={!dismiss} className="flex flex-col">
      <ul id={id} role={role} aria-label={ariaLabel} {...{ [marker]: "" }} data-ph-listbox="" className={`min-h-0 overflow-y-auto overscroll-contain text-xs whitespace-nowrap shadow-lg ${surface ?? "ph-panel bg-base-100 p-1"} ${className}`}>
        {children}
      </ul>
    </AnchoredPopover>
  );
}
