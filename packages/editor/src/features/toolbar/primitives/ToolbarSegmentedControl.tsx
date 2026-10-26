/**
 * Pill / segmented control: neutral track, the active segment is base-100 + shadow.
 *
 *   <ToolbarSegmentedControl value={v} onChange={set} options={[{ value: "left", label: "L" }]} />
 */
import type { ReactNode } from "react";

export const TOOLBAR_SEGMENTED_ACTIVE = "bg-base-100 text-base-content shadow-sm";
export const TOOLBAR_SEGMENTED_INACTIVE = "text-neutral-content hover:text-base-content";

export interface ToolbarSegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Per-option tooltip (shown through `tooltipId`). */
  tooltip?: string;
  ariaLabel?: string;
  /** Overrides the option width (e.g. `flex-none px-2` for a narrow clear chip). */
  widthClass?: string;
}

export interface ToolbarSegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ToolbarSegmentedOption<T>[];
  /** Compact text. */
  dense?: boolean;
  /** Track sized by content instead of `w-full`. */
  compact?: boolean;
  /** Appended to every option button. */
  optionClassName?: string;
  className?: string;
  "aria-label"?: string;
  /** Extra control on the same track. */
  trailing?: ReactNode;
  tooltipId?: string;
  /** The track's background (default the dark neutral track; `bg-base-200` for a light tab bar). */
  trackColor?: string;
  /** The inactive option's text (default light-on-neutral; override on a light track). */
  inactiveColor?: string;
}

export function ToolbarSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  dense = false,
  compact = false,
  optionClassName = "",
  className = "",
  "aria-label": ariaLabel,
  trailing,
  tooltipId,
  trackColor = "bg-neutral",
  inactiveColor = TOOLBAR_SEGMENTED_INACTIVE,
}: ToolbarSegmentedControlProps<T>) {
  const trackClass = compact ? `${trackColor} inline-flex shrink-0 gap-1 rounded-md p-1` : `${trackColor} flex w-full min-w-0 gap-1 rounded-md p-1 overflow-hidden`;
  const size = `rounded h-6 px-2 ${dense ? "text-[11px]" : "text-xs"} leading-tight font-medium`;
  return (
    <div role="tablist" aria-label={ariaLabel} className={`${trackClass} ${className}`}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={opt.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            data-tooltip-id={opt.tooltip ? tooltipId : undefined}
            data-tooltip-content={opt.tooltip}
            className={`${opt.widthClass ?? (compact ? "" : "min-w-0 flex-1")} flex items-center justify-center gap-1 transition-colors ${size} ${selected ? TOOLBAR_SEGMENTED_ACTIVE : inactiveColor} ${optionClassName}`}
          >
            {typeof opt.label === "string" ? <span className="min-w-0 truncate">{opt.label}</span> : opt.label}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
