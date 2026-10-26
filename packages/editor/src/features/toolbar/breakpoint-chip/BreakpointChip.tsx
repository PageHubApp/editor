/**
 * Breakpoint chip for one property-map key on the inspected element: values from its `class`
 * attribute; the open popover is `ui.chipPopover` (through `ui.set`); right-click opens the
 * chip menu, whose actions are one `classes.layers` write each.
 *
 *   <BreakpointChip prop="padding" label="Padding" />
 */
import { classGroupsFacet } from "@pagehub/engine/kits";
import { useEffect, useState } from "react";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { useUi } from "../../../react/useUi";
import { BreakpointChipView } from "./BreakpointChipView";
import { ChipContextMenuView } from "./ChipContextMenu";
import { ChipPopoverView, PULSE_MS } from "./ChipPopover";
import { chipActions, planChipAction, sourceLayer } from "./layerOps";
import { activeChipBp, explicitValues, type ChipBp } from "./overrides";
import { classBinding } from "../../inspector/propertyBinding";

interface BreakpointChipProps {
  /** Property-map key or alias. */
  prop: string;
  label?: string;
  ghost?: boolean;
}

export function BreakpointChip({ prop, label, ghost }: BreakpointChipProps) {
  const { group } = classBinding(prop);
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, (a, b) => a.view === b.view && a.density === b.density && a.chipPopover === b.chipPopover && a.multiScope === b.multiScope);
  const run = useRunCommand();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const popover = ui.chipPopover;
  const open = !!handle && popover?.handle === handle && popover.group === group;
  const pulse = open ? (popover?.pulse ?? null) : null;
  // "Show source" pulse lasts PULSE_MS, then clears so a reopen doesn't pulse again
  useEffect(() => {
    if (!pulse || !popover) return;
    const t = setTimeout(() => run("ui.set", { chipPopover: { ...popover, pulse: null } }), PULSE_MS);
    return () => clearTimeout(t);
  }, [pulse, popover, run]);
  if (!handle || !def) return null;

  const explicit = explicitValues(classes, def);
  const name = label ?? prop;
  const activeBp = activeChipBp(ui.view);
  const active: ChipBp = activeBp ?? "mobile";
  const multi = ui.multiScope;
  return (
    <>
      <BreakpointChipView
        buttonRef={setAnchor}
        explicit={explicit}
        activeBp={activeBp}
        density={ui.density}
        label={name}
        ghost={ghost}
        open={open}
        onToggle={() => run("ui.set", { chipPopover: open ? null : { handle, group } })}
        onContextMenu={(x, y) => setMenuAt({ x, y })}
      />
      <ChipPopoverView
        open={open}
        anchor={anchor}
        title={name}
        explicit={explicit}
        activeBp={activeBp}
        multi={multi}
        pulse={pulse}
        onCell={(bp, alt) => {
          if (!alt) return void run("ui.set", { view: bp });
          if (bp !== "mobile") run("ui.set", { multiScope: multi.includes(bp) ? multi.filter((b) => b !== bp) : [...multi, bp] });
        }}
        onClearMulti={() => run("ui.set", { multiScope: [] })}
        onClose={() => run("ui.set", { chipPopover: null })}
      />
      <ChipContextMenuView
        at={menuAt}
        active={active}
        enabled={chipActions(explicit, active)}
        source={sourceLayer(explicit, active)}
        onAction={(a) => run("classes.layers", { group, at: handle, layers: planChipAction(a, explicit, active) })}
        onShowSource={() => run("ui.set", { chipPopover: { handle, group, pulse: sourceLayer(explicit, active) } })}
        onClose={() => setMenuAt(null)}
      />
    </>
  );
}
