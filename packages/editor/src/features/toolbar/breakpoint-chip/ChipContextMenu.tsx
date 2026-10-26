// Presentational part only; state lives in connectors/toolbar/breakpoint-chip/BreakpointChip.tsx.
/**
 * The breakpoint chip's right-click menu: Reset at <active> · Reset all breakpoints · Promote to
 * base · Copy down · Copy up · Show source. Closes on an outside mousedown, Esc (overlay stack)
 * or after an action; kept inside the window assuming 220×240.
 */
import { MENU_ITEM, MenuDivider, MenuSurface } from "../../menus/MenuSurface";
import { Icon, type IconName } from "../../../primitives/icons";
import type { ChipAction } from "./layerOps";
import { CHIP_BP_LABEL, type ChipBp } from "./overrides";

/** The size the position clamp assumes. */
export const CHIP_MENU_SIZE = { width: 220, height: 240 } as const;

interface ChipContextMenuViewProps {
  at: { x: number; y: number } | null;
  active: ChipBp;
  enabled: Record<ChipAction, boolean>;
  source: ChipBp | null;
  onAction(action: ChipAction): void;
  onShowSource(): void;
  onClose(): void;
}

export function ChipContextMenuView({ at, active, enabled, source, onAction, onShowSource, onClose }: ChipContextMenuViewProps) {
  const item = (action: ChipAction, icon: IconName, label: string) => (
    <button type="button" role="menuitem" className={MENU_ITEM} disabled={!enabled[action]} onClick={() => (onAction(action), onClose())}>
      <Icon name={icon} className="size-3.5 shrink-0 opacity-80" />
      {label}
    </button>
  );
  return (
    <MenuSurface at={at} id="chip-context-menu" ariaLabel="Breakpoint property actions" onClose={onClose} width={CHIP_MENU_SIZE.width} height={CHIP_MENU_SIZE.height}>
      {item("reset", "trash", `Reset at ${CHIP_BP_LABEL[active]}`)}
      {item("resetAll", "refresh", "Reset all breakpoints")}
      <MenuDivider />
      {item("promote", "arrows-move", "Promote to base")}
      {item("copyDown", "corner-down-left", "Copy down (smaller bps)")}
      {item("copyUp", "corner-up-left", "Copy up (larger bps)")}
      <MenuDivider />
      <button type="button" role="menuitem" className={MENU_ITEM} disabled={!source} onClick={() => (onShowSource(), onClose())}>
        <Icon name="eye" className="size-3.5 shrink-0 opacity-80" />
        Show source ({source ? CHIP_BP_LABEL[source] : "—"})
      </button>
    </MenuSurface>
  );
}
