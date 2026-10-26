/**
 * Chip — the one row primitive of the sidebar: label gutter on the left, control on the right.
 *
 *   <Chip label="Padding" adornment={<BreakpointChip group="p" />}>
 *     <input className="input-plain flex-1" />
 *   </Chip>
 *
 * - `frame="bordered"` (default): `input-wrapper`, `h-8`; `frame="bare"`: label gutter + child
 *   slot only, for controls that own their chrome (segmented controls, textareas).
 * - `grow`: `min-h-8` instead of `h-8` so multi-line content can expand.
 * - `variant="swatch"`: no left padding, for a full-bleed leading swatch.
 * - `passthrough`: render children unwrapped (a parent already provides the row).
 * - `adornment`: shown beside the label — the breakpoint chip. The caller passes it, so the row
 *   stays presentational.
 *
 * `PopoverChip` (below) is the popover mode: the frame hosts a click-to-open trigger (leading
 * icon + summary, or a full-bleed `preview`) and a clear X; the frame border turns primary
 * while open. The label clicks through to the trigger.
 */
import { forwardRef, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { TOOLTIP_ID, tooltip } from "./tooltip";

/** Label button; a tooltip only when the label is truncated. Click forwards to the control. */
function RowLabel({ label, onClick, width, adornment }: { label: string; onClick?: () => void; width?: string; adornment?: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);
  return (
    <div className={`${width || "w-20"} ${adornment ? "group/bp-row gap-1" : ""} flex min-w-0 shrink-0 items-center`}>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        data-tooltip-id={truncated ? TOOLTIP_ID : undefined}
        data-tooltip-content={truncated ? label : undefined}
        data-tooltip-place="top"
        className="text-base-content hover:text-primary focus-visible:ring-ring/60 min-w-0 flex-1 cursor-pointer truncate text-left text-xs outline-none focus:outline-none focus-visible:ring-1 focus-visible:outline-none"
      >
        {label}
      </button>
      {adornment}
    </div>
  );
}

export interface ChipProps {
  label?: string;
  adornment?: ReactNode;
  /** Frame border highlights (open popover / focus). */
  open?: boolean;
  frame?: "bordered" | "bare";
  grow?: boolean;
  /** Label gutter width class (default `w-20`). */
  labelWidth?: string;
  variant?: "default" | "swatch";
  passthrough?: boolean;
  onClick?: (e: MouseEvent) => void;
  /** Label click; defaults to `onClick`. */
  onLabelClick?: () => void;
  /** Rendered inside the frame after the children. */
  trailing?: ReactNode;
  children: ReactNode;
}

function frameClasses(frame: "bordered" | "bare", grow: boolean, open: boolean, variant: "default" | "swatch", hasTrailing: boolean): string {
  if (frame === "bare") return `flex w-full min-w-0 items-center text-xs ${grow ? "min-h-8" : ""} gap-1.5`;
  const variantClass = variant === "swatch" ? `gap-1.5 pl-0! overflow-hidden ${hasTrailing ? "pr-1" : "pr-0!"}` : "gap-1.5 px-1";
  return `input-wrapper text-base-content flex ${grow ? "min-h-8" : "h-8"} w-full min-w-0 items-center text-xs ${variantClass} ${open ? "border-primary" : ""}`;
}

export function Chip({ label, adornment, open = false, frame = "bordered", grow = false, labelWidth, variant = "default", passthrough, onClick, onLabelClick, trailing, children }: ChipProps) {
  if (passthrough) return <>{children}</>;
  const frameNode = (
    <div onClick={onClick} className={frameClasses(frame, grow, open, variant, trailing != null && trailing !== false)}>
      {children}
      {trailing}
    </div>
  );
  if (!label) return frameNode;
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <RowLabel label={label} width={labelWidth} adornment={adornment} onClick={onLabelClick ?? (onClick ? () => onClick({} as MouseEvent) : undefined)} />
      {frameNode}
    </div>
  );
}

export interface PopoverChipProps {
  label?: string;
  adornment?: ReactNode;
  open?: boolean;
  labelWidth?: string;
  onTriggerClick(): void;
  /** The X. A row that is cleared stays visible for the session (the inspector decides). */
  onClear(): void;
  triggerAriaLabel: string;
  clearAriaLabel: string;
  /** Icon / swatch before the summary; with `variant="preview"` it fills the body. */
  leading?: ReactNode;
  summary?: ReactNode;
  variant?: "default" | "preview";
  previewOverlay?: ReactNode;
  /** Rendered before the X. */
  trailingExtras?: ReactNode;
}

/** A row whose control opens a popover (colour, gradient, media, animations…). */
export const PopoverChip = forwardRef<HTMLButtonElement, PopoverChipProps>(function PopoverChip(p, ref) {
  const open = p.open ?? false;
  const trigger =
    p.variant === "preview" ? (
      <button ref={ref} type="button" onClick={p.onTriggerClick} aria-expanded={open} aria-haspopup="true" aria-label={p.triggerAriaLabel} className="border-base-300 relative flex h-6 min-w-0 flex-1 items-center justify-center overflow-hidden rounded border outline-none focus:outline-none focus-visible:ring-0 focus-visible:outline-none">
        {p.leading}
        {p.previewOverlay}
      </button>
    ) : (
      <button ref={ref} type="button" onClick={p.onTriggerClick} aria-expanded={open} aria-haspopup="true" aria-label={p.triggerAriaLabel} className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-1 text-left outline-none focus:outline-none focus-visible:ring-0 focus-visible:outline-none">
        {p.leading ? (
          <span className="text-base-content/60 shrink-0" aria-hidden>
            {p.leading}
          </span>
        ) : null}
        <span className="text-base-content min-w-0 flex-1 truncate">{p.summary}</span>
      </button>
    );
  const frame = (
    <div className={frameClasses("bordered", false, open, "default", true)}>
      {trigger}
      {p.trailingExtras}
      <button type="button" onClick={p.onClear} aria-label={p.clearAriaLabel} {...tooltip(p.clearAriaLabel)} className="text-base-content/50 hover:text-base-content hover:bg-base-200 flex size-5 shrink-0 items-center justify-center rounded transition-colors">
        <Icon name="x" className="size-3" />
      </button>
    </div>
  );
  if (!p.label) return frame;
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <RowLabel label={p.label} width={p.labelWidth} adornment={p.adornment} onClick={p.onTriggerClick} />
      {frame}
    </div>
  );
});
