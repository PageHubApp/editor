// Presentational part only; state lives in connectors/toolbar/breakpoint-chip/BreakpointChip.tsx.
/**
 * The breakpoint chip's popover: one cell per layer (base, sm…2xl) with the value or "—".
 * Click a cell → switch the canvas to that layer; Alt+click (not base) → toggle it in
 * multi-scope, with a banner "Editing N breakpoints together · clear". "Show source" pulses a
 * cell for 1.6s. Each cell carries a tooltip id so its tooltip text actually shows.
 */
import type { MouseEvent } from "react";
import { AnchoredPopover } from "../../../primitives/AnchoredPopover";
import { OVERLAY_ROOT_CLASS } from "../../../primitives/portal";
import { tooltip } from "../../../primitives/tooltip";
import { CHIP_BP_LABEL, CHIP_BP_LETTER, CHIP_BP_ORDER, type BpValue, type ChipBp } from "./overrides";

export const PULSE_MS = 1600;

interface ChipPopoverViewProps {
  open: boolean;
  anchor: HTMLElement | null;
  title: string;
  explicit: readonly BpValue[];
  activeBp: ChipBp | null;
  multi: readonly ChipBp[];
  pulse?: ChipBp | null;
  onCell(bp: ChipBp, alt: boolean): void;
  onClearMulti(): void;
  onClose(): void;
}

export function ChipPopoverView({ open, anchor, title, explicit, activeBp, multi, pulse, onCell, onClearMulti, onClose }: ChipPopoverViewProps) {
  return (
    <AnchoredPopover
      open={open && !!anchor}
      onOpenChange={(o) => !o && onClose()}
      anchor={anchor}
      placement="bottom"
      className={`${OVERLAY_ROOT_CLASS} border-base-300 bg-base-100 text-base-content rounded-xl border p-2 shadow-xl`}
      style={{ minWidth: 220 }}
    >
      <div data-ph-chip-popover="" className="flex items-center justify-between gap-2 px-1 pb-1">
        <span className="text-base-content text-[11px] font-semibold">{title}</span>
        <span className="text-base-content/60 text-[9px]">alt-click = multi</span>
      </div>
      {multi.length > 0 && (
        <div className="bg-primary/10 text-primary mb-1 flex items-center justify-between gap-2 rounded px-2 py-1 text-[10px]">
          <span>
            Editing {multi.length} breakpoint{multi.length === 1 ? "" : "s"} together
          </span>
          <button type="button" onClick={onClearMulti} className="hover:underline">
            clear
          </button>
        </div>
      )}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${CHIP_BP_ORDER.length}, minmax(28px, 1fr))` }}>
        {CHIP_BP_ORDER.map((bp) => (
          <div key={`h-${bp}`} className="text-base-content/60 text-center font-mono text-[9px] leading-none">
            {CHIP_BP_LETTER[bp]}
          </div>
        ))}
        {CHIP_BP_ORDER.map((bp) => {
          const value = explicit.find((e) => e.bp === bp)?.value ?? null;
          const ring = activeBp === bp ? "ring-1 ring-primary" : multi.includes(bp) ? "ring-1 ring-primary/60" : "";
          return (
            <button
              key={`v-${bp}`}
              type="button"
              data-bp-cell={bp}
              onClick={(e: MouseEvent) => onCell(bp, e.altKey)}
              className={`bg-base-200 hover:bg-base-300 flex h-9 w-full flex-col items-center justify-center rounded transition-colors ${ring} ${pulse === bp ? "animate-pulse ring-2 ring-amber-400" : ""}`}
              {...tooltip(`${CHIP_BP_LABEL[bp]}: ${value ?? "—"}`)}
              aria-label={`${CHIP_BP_LABEL[bp]} value`}
            >
              <span className={`max-w-full truncate px-1 text-[10px] ${value !== null ? "text-base-content" : "text-base-content/40"}`}>{value !== null ? value.replace(/^[a-z]+-/, "") : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="text-base-content/60 mt-2 px-1 text-[9px] leading-snug">Click a cell → switch canvas view. Alt-click → toggle multi-scope writes.</div>
    </AnchoredPopover>
  );
}
