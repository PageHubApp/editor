/**
 * The per-action detail sub-form — every attribute an action type needs, written straight
 * to the element's native attributes. Shared by the Action "+" picker's add-detail
 * popover (`ActionPicker`) and the Action section's re-edit body (`ActionsEditor`) so a link's
 * href / target / rel, a show-hide's target / direction / trigger, a download's url / filename
 * read and write the exact same fields whether you just added the action or came back to edit it.
 */
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { ACTION_SPECS, type ActionField } from "./actionSpecs";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";

/** One field of an action's detail form, bound to the attribute it edits. */
function ActionFieldInput({ handle, field }: { handle: NodeHandle; field: ActionField }) {
  const run = useRunCommand();
  const raw = useEditorState(() => (handle.alive && handle.kind === "element" ? (handle.attr(field.attr) ?? null) : null));
  const write = (v: string | null) => run("attr.set", { name: field.attr, value: v, at: handle });
  const common = { label: field.label, inputId: `action-${field.attr}` };
  const k = `${field.attr}:${raw}`;
  return field.kind === "enum" ? (
    <ToolbarItemView key={k} {...common} type="select" value={raw ?? ""} valueLabels={["", ...(field.options ?? [])]} formatLabel={(v) => field.optionLabels?.[v] ?? v} onChange={(v) => write(v || null)} />
  ) : (
    <ToolbarItemView key={k} {...common} type="text" value={raw ?? ""} placeholder={field.placeholder} onChange={(v) => write(v === "" ? null : v)} />
  );
}

/** Every field an action needs (its full sub-form), written straight to its attributes. */
export function ActionDetail({ handle, fields }: { handle: NodeHandle; fields: readonly ActionField[] }) {
  return (
    <div className="grid gap-2" data-action-detail={fields[0]?.attr}>
      {fields.map((f) => (
        <ActionFieldInput key={f.attr} handle={handle} field={f} />
      ))}
    </div>
  );
}

/** Clear every attribute that defines action `type` (its "remove"). */
export function clearAction(run: ReturnType<typeof useRunCommand>, handle: NodeHandle, type: string) {
  const spec = ACTION_SPECS[type];
  if (!spec) return;
  const names = new Set<string>([...spec.attrs.map(([n]) => n), ...spec.fields.map((f) => f.attr)]);
  for (const name of names) run("attr.set", { name, value: null, at: handle });
}
