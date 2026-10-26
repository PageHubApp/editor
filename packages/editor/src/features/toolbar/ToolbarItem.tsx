/**
 * Property row for one property-map key on the inspected element. The map supplies the class
 * group (and `hover` variant); the row shows the value for the current view (`readClass`: view
 * fallbacks, dark falls back to non-dark) and writes through `classes.set` to the active scopes
 * (`writeScopes`: canvas view or multi-scope, `dark:`, `hover:` for hover keys). One change =
 * one command = one `class` write.
 *
 *   <ToolbarItem prop="gap" label="Gap" type="select" valueLabels={["gap-2", "gap-4"]} />
 */
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { writeScopes } from "../../state/uiState";
import { ToolbarItemView, type ToolbarItemViewProps } from "./ToolbarItemView";
import { classBinding } from "../inspector/propertyBinding";
import { BreakpointChip } from "./breakpoint-chip/BreakpointChip";

const keys = new WeakMap<object, number>();
let nextKey = 0;
const handleKey = (h: object): number => {
  let k = keys.get(h);
  if (k === undefined) keys.set(h, (k = ++nextKey));
  return k;
};

export interface ToolbarItemProps extends Omit<ToolbarItemViewProps, "value" | "onChange" | "adornment"> {
  /** Property-map key or alias. */
  prop: string;
  /** Called after a write with the new value. */
  onChange?: (value: string) => void;
}

export function ToolbarItem({ prop, onChange, ...view }: ToolbarItemProps) {
  const { group, state } = classBinding(prop);
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, (a, b) => a.view === b.view && a.dark === b.dark && a.multiScope === b.multiScope);
  const run = useRunCommand();
  if (!handle || !def) return null;

  const { value } = readClass(classes, def, { view: ui.view, dark: ui.dark, state });
  const changed = (next: string) => {
    if (run("classes.set", { group, token: next === "" ? null : next, scopes: writeScopes(ui, state), at: handle })) onChange?.(next);
  };
  return (
    <ToolbarItemView
      // uncontrolled inputs: a new element or view starts a fresh field
      key={`${handleKey(handle)}:${ui.view}:${ui.dark}`}
      {...view}
      inputId={view.inputId ?? group}
      value={value}
      onChange={changed}
      adornment={<BreakpointChip prop={prop} label={view.label} />}
    />
  );
}
