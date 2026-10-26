/**
 * The chip menu's actions as pure plans: given the layers that hold a value and the active
 * layer, which layers to write. The connector runs a plan as one `classes.layers` command.
 */
import type { Breakpoint } from "@pagehub/engine/kits";
import { CHIP_BP_ORDER, type BpValue, type ChipBp } from "./overrides";

export type ChipAction = "reset" | "resetAll" | "promote" | "copyDown" | "copyUp";
type LayerWrite = { breakpoint?: Breakpoint; token: string | null };

const layer = (bp: ChipBp, token: string | null): LayerWrite => (bp === "mobile" ? { token } : { breakpoint: bp, token });
const at = (explicit: readonly BpValue[], bp: ChipBp) => explicit.find((e) => e.bp === bp)?.value ?? null;

/** What the menu can do (disabled items). Every action but reset-all needs a value at the active layer. */
export function chipActions(explicit: readonly BpValue[], active: ChipBp): Record<ChipAction, boolean> {
  const here = at(explicit, active) !== null;
  const overrides = explicit.some((e) => e.bp !== "mobile");
  return { reset: here, resetAll: explicit.length > 0, promote: here && overrides, copyDown: here && active !== "mobile", copyUp: here && active !== "2xl" };
}

export function planChipAction(action: ChipAction, explicit: readonly BpValue[], active: ChipBp): LayerWrite[] {
  const value = at(explicit, active);
  const i = CHIP_BP_ORDER.indexOf(active);
  switch (action) {
    case "reset":
      return [layer(active, null)];
    case "resetAll":
      return CHIP_BP_ORDER.map((bp) => layer(bp, null));
    case "promote":
      return value === null ? [] : [layer("mobile", value), ...CHIP_BP_ORDER.slice(1).map((bp) => layer(bp, null))];
    case "copyDown":
      return value === null ? [] : CHIP_BP_ORDER.slice(0, i).map((bp) => layer(bp, value));
    case "copyUp":
      return value === null ? [] : CHIP_BP_ORDER.slice(i + 1).map((bp) => layer(bp, value));
  }
}

/**
 * The layer the active value is read from ("Show source"): the active layer when it holds one;
 * else a breakpoint reads base; base reads `md:`.
 */
export function sourceLayer(explicit: readonly BpValue[], active: ChipBp): ChipBp | null {
  if (at(explicit, active) !== null) return active;
  const from: ChipBp = active === "mobile" ? "md" : "mobile";
  return at(explicit, from) !== null ? from : null;
}
