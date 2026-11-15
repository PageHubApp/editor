/**
 * Which breakpoint layers hold a group's token — the chip and the section dot read the same
 * thing. Exact-prefix reads with dark and states off: the chip never shows `dark:` or
 * `hover:` tokens (inventory: "Chip commands write with dark off").
 */
import { type ClassGroup } from "@pagehub/engine";
import { SCREEN_NAME, SCREEN_SHORT } from "../../canvas/viewportMath";
import { BREAKPOINTS, scopePrefix, tokenAt, type Breakpoint, type View } from "@pagehub/engine/kits";

export const CHIP_BP_ORDER = ["mobile", ...BREAKPOINTS] as const;
export type ChipBp = (typeof CHIP_BP_ORDER)[number];

/** Letter beside the dot: the screen size's short name. */
export const CHIP_BP_LETTER: Readonly<Record<ChipBp, string>> = SCREEN_SHORT;
/** Label in tooltips and popover cells: the screen size's name. */
export const CHIP_BP_LABEL: Readonly<Record<ChipBp, string>> = SCREEN_NAME;

export interface BpValue {
  bp: ChipBp;
  value: string;
}

/** The group's token at each layer that holds one, base first. */
export function explicitValues(classes: readonly string[], group: ClassGroup): BpValue[] {
  return CHIP_BP_ORDER.flatMap((bp) => {
    const value = tokenAt(classes, group, scopePrefix({ breakpoint: bp === "mobile" ? undefined : bp }));
    return value === null ? [] : [{ bp, value }];
  });
}

/** True when any group has a token at a non-base breakpoint. */
export function hasAnyOverride(classes: readonly string[], groups: readonly ClassGroup[]): boolean {
  return groups.some((g) => explicitValues(classes, g).some((e) => e.bp !== "mobile"));
}

/** Canvas view → the chip's active layer; `desktop` (fluid) has none. */
export function activeChipBp(view: View): ChipBp | null {
  return view === "desktop" ? null : view;
}

/** Highest breakpoint holding an override, or null. */
export function highestOverride(explicit: readonly BpValue[]): Breakpoint | null {
  for (let i = BREAKPOINTS.length - 1; i >= 0; i--) if (explicit.some((e) => e.bp === BREAKPOINTS[i])) return BREAKPOINTS[i]!;
  return null;
}
