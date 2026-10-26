/**
 * ShorthandControl — the box-model / spacing editor (padding, margin, gap, inset). One row with a
 * mode toggle on the right: uniform
 * (`p`), axes (`px` / `py`) or per-side (`pt` / `pr` / `pb` / `pl`). Switching modes clears the
 * class groups the other modes own so only one set of tokens is ever live. The initial mode is the
 * most-specific one that has any value. Each slot is a real `GroupUniversalField` bound straight to
 * its class group.
 *
 *   <ShorthandControl label="Padding" spec={paddingSpec} />
 */
import { useMemo, useState } from "react";
import { type ClassGroup } from "@pagehub/engine";
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import type { ShorthandModeSpec } from "../controlSpecs";
import { ControlIcon } from "../controlIcons";
import { TOOLTIP_ID } from "../../../primitives/tooltip";
import { ToolbarSegmentedControl } from "../../toolbar/primitives/ToolbarSegmentedControl";
import type { ValueType } from "../../toolbar/universal/universalValue";
import { GroupUniversalField } from "../../toolbar/UniversalInput";

interface ShorthandControlProps {
  label: string;
  modes: ShorthandModeSpec[];
  allowedTypes?: readonly ValueType[];
}

export function ShorthandControl({ label, modes, allowedTypes }: ShorthandControlProps) {
  const { classes } = useInspectedClass();
  const groups = useEditorState((s) => s.facet(classGroupsFacet));
  const ui = useUi((u) => u, (a, b) => a.view === b.view && a.dark === b.dark && a.multiScope === b.multiScope);
  const run = useRunCommand();

  const hasValue = (group: string): boolean => {
    const def = groups.get(group);
    return !!def && (readClass(classes, def as ClassGroup, { view: ui.view, dark: ui.dark }).value ?? "") !== "";
  };

  // Initial mode: the most-specific mode (last in the array) that already has a value set.
  const initial = useMemo(() => {
    for (let i = modes.length - 1; i >= 0; i--) if (modes[i]!.slots.some((s) => hasValue(s.group))) return modes[i]!.id;
    return modes[0]!.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.join(" "), ui.view, ui.dark]);

  const [activeId, setActiveId] = useState(initial);
  const active = modes.find((m) => m.id === activeId) ?? modes[0]!;

  const switchTo = (next: ShorthandModeSpec) => {
    if (next.id === activeId) return;
    const keep = new Set(next.slots.map((s) => s.group));
    for (const m of modes) for (const slot of m.slots) {
      if (!keep.has(slot.group)) run("classes.set", { group: slot.group, token: null, scopes: writeScopes(ui) });
    }
    setActiveId(next.id);
  };

  const single = active.slots.length === 1;
  const cols = active.columns ?? active.slots.length;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-0.5">
        <span className="text-base-content w-20 shrink-0 cursor-default truncate text-xs">{label}</span>
        <div className="min-w-0 flex-1">
          {single ? (
            <GroupUniversalField group={active.slots[0]!.group} prefix={active.slots[0]!.prefix} allowedTypes={allowedTypes} ariaLabel={label} />
          ) : (
            <span className="text-neutral-content flex h-8 items-center text-xs italic opacity-60">{active.ariaLabel}</span>
          )}
        </div>
        {modes.length > 1 && (
          <ToolbarSegmentedControl
            compact
            optionClassName="w-7"
            tooltipId={TOOLTIP_ID}
            value={activeId}
            onChange={(id) => { const m = modes.find((x) => x.id === id); if (m) switchTo(m); }}
            options={modes.map((m) => ({ value: m.id, label: <ControlIcon name={m.icon} />, tooltip: m.ariaLabel, ariaLabel: m.ariaLabel }))}
          />
        )}
      </div>
      {!single && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {active.slots.map((slot) => (
            <div key={slot.group} className="flex min-w-0 items-center gap-1">
              <span className="text-neutral-content w-4 shrink-0 text-center text-[10px]">{slot.label}</span>
              <div className="min-w-0 flex-1">
                <GroupUniversalField group={slot.group} prefix={slot.prefix} allowedTypes={allowedTypes} ariaLabel={`${label} ${slot.label}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
