// Presentational part only; state lives in connectors/toolbar/breakpoint-chip/BreakpointChip.tsx.
/**
 * The per-property breakpoint indicator beside a row label. Silent when clean (density
 * `auto`): hidden with no overrides (or a faint ghost that fades in on `group/bp-row` hover);
 * amber dot + letter for an override elsewhere, primary dot when it is at the active
 * breakpoint; a count badge from 2 overrides. Click toggles the popover; right-click opens
 * the chip menu.
 *
 *   <BreakpointChipView explicit={[{ bp: "md", value: "p-4" }]} activeBp="md" density="auto" label="Padding" … />
 */
import type { MouseEvent, Ref } from "react";
import { TOOLTIP_ID } from "../../../primitives/tooltip";
import { CHIP_BP_LABEL, CHIP_BP_LETTER, highestOverride, type BpValue, type ChipBp } from "./overrides";

interface BreakpointChipViewProps {
  /** Layers holding a value, base first (`explicitValues`). */
  explicit: readonly BpValue[];
  /** Canvas layer; null on the fluid desktop canvas. */
  activeBp: ChipBp | null;
  density: "auto" | "always" | "off";
  /** Tooltip / aria name; also `data-ph-prop-key`. */
  label: string;
  /** Show a faint placeholder when clean (section headers). */
  ghost?: boolean;
  open?: boolean;
  onToggle(): void;
  onContextMenu?(x: number, y: number): void;
  /** The chip button (the popover anchors to it). */
  buttonRef?: Ref<HTMLButtonElement>;
}

export function BreakpointChipView({ explicit, activeBp, density, label, ghost = false, open = false, onToggle, onContextMenu, buttonRef }: BreakpointChipViewProps) {
  if (density === "off") return null;
  const overrides = explicit.filter((e) => e.bp !== "mobile");
  const count = overrides.length;
  const hasAnyValue = explicit.length > 0;
  const isGhost = density === "auto" && count === 0;
  if (isGhost && !ghost) return null;

  const hollow = count === 0 && (hasAnyValue || density === "always");
  const atActive = activeBp !== null && activeBp !== "mobile" && overrides.some((o) => o.bp === activeBp);
  const letter = count === 0 ? CHIP_BP_LETTER[activeBp ?? "mobile"] : CHIP_BP_LETTER[highestOverride(explicit) ?? "md"];
  const dotClass = isGhost ? "border-base-content/50 border bg-transparent" : hollow ? "border border-base-content/40 bg-transparent opacity-30" : atActive ? "bg-primary" : "bg-amber-500";
  const tooltip = isGhost ? "Click to add a responsive override" : !hasAnyValue ? `${label}: no value` : explicit.map((e) => `${CHIP_BP_LABEL[e.bp]}: ${e.value}`).join(" · ");

  const stop = (e: MouseEvent) => (e.preventDefault(), e.stopPropagation());
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(e) => (stop(e), onToggle())}
      onContextMenu={(e) => (stop(e), onContextMenu?.(e.clientX, e.clientY))}
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={tooltip}
      data-tooltip-place="top"
      data-tooltip-offset={6}
      data-ph-bp-chip=""
      data-ph-prop-key={label}
      aria-label={`Breakpoint overrides for ${label}`}
      aria-expanded={open}
      className={`relative inline-flex h-3.5 min-w-[14px] cursor-pointer items-center justify-center gap-0.5 rounded-[3px] px-[3px] transition-[colors,opacity] duration-150 ${
        open ? "bg-base-200" : "hover:bg-base-200"
      } ${isGhost ? "opacity-0 group-hover/bp-row:opacity-40 hover:!opacity-100" : ""}`}
    >
      <span className={`inline-block size-[6px] shrink-0 rounded-full ${dotClass}`} aria-hidden />
      {hollow || isGhost ? null : (
        <span className="text-base-content font-mono text-[9px] leading-none" aria-hidden>
          {letter}
        </span>
      )}
      {count >= 2 && (
        <span className="bg-primary text-primary-content absolute -top-1 -right-1 inline-flex size-3 items-center justify-center rounded-full font-mono text-[8px] leading-none" aria-hidden>
          {count}
        </span>
      )}
    </button>
  );
}
