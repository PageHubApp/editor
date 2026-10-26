/**
 * Universal value row for a class property (`width`, `gap`, `padding`…): the stored class token
 * becomes the field's value (`w-[10px]` → `10px`), and each commit is one `classes.set`.
 *
 *   <UniversalInput prop="width" label="Width" prefix="w" options={["w-full", "w-1/2"]} />
 *
 * `GroupUniversalField` is the group-bound core (no property-map lookup) the shorthand editor
 * reuses for each side's class group (`px`, `pt`, …), which have no property-map key of their own.
 */
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { writeScopes } from "../../state/uiState";
import { Chip } from "../../primitives/Chip";
import { UniversalInput as UniversalInputView, type UniversalInputProps as ViewProps } from "./universal/UniversalInput";
import { tokenToValue, valueToToken } from "./universal/universalValue";
import { classBinding } from "../inspector/propertyBinding";
import { BreakpointChip } from "./breakpoint-chip/BreakpointChip";

interface GroupUniversalFieldProps extends Omit<ViewProps, "value" | "onChange"> {
  /** Class group id to read / write (`w`, `px`, `top`). */
  group: string;
  /** Class prefix for arbitrary values; default: the group id. */
  prefix?: string;
  /** State variant written with no breakpoint (`hover`). */
  state?: string;
}

/** The value field bound straight to a class group — no property-map key needed. */
export function GroupUniversalField({ group, prefix, state, ...view }: GroupUniversalFieldProps) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, (a, b) => a.view === b.view && a.dark === b.dark && a.multiScope === b.multiScope);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const p = prefix ?? group;
  const token = readClass(classes, def, { view: ui.view, dark: ui.dark, state }).value ?? "";
  return (
    <UniversalInputView
      key={`${ui.view}:${ui.dark}`}
      {...view}
      prefix={p}
      value={tokenToValue(p, token)}
      onChange={(v) => void run("classes.set", { group, token: valueToToken(p, v) || null, scopes: writeScopes(ui, state), at: handle })}
    />
  );
}

export interface UniversalInputProps extends Omit<ViewProps, "value" | "onChange"> {
  prop: string;
  label?: string;
  labelWidth?: string;
  /** Class prefix for arbitrary values (`w`, `gap`, `mt`); default: the group id. */
  prefix?: string;
}

export function UniversalInput({ prop, label, labelWidth, prefix, ...view }: UniversalInputProps) {
  const { group, state } = classBinding(prop);
  return (
    <Chip label={label} labelWidth={labelWidth} adornment={<BreakpointChip prop={prop} label={label} />} frame="bordered">
      <GroupUniversalField group={group} prefix={prefix} state={state} ariaLabel={view.ariaLabel ?? label} {...view} />
    </Chip>
  );
}
