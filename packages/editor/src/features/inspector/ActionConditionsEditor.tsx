/**
 * ActionConditionsEditor — the per-action "only fire if…" sub-editor. For each action set on the
 * element it offers a Liquid condition; setting one wraps that action's attributes in a
 * `{% if … %}` inside the open tag (see `actionGate`), so the behaviour fires only when the
 * condition holds.
 *
 *   <ActionConditionsEditor handle={buttonHandle} />
 *
 * Detection is gate-aware (`gateReader`) so an action stays listed here once it is gated, with its
 * condition editable and a remove that ungates it.
 */
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { ACTION_SPECS, detectActiveActions } from "./actionSpecs";
import { useState } from "react";
import { AddBranchButton, BranchRow, ExpressionField, PanelNote } from "../liquid/LiquidFields";
import { useCompletions } from "../liquid/BlockPanels";
import { SERVER_TYPES, parseServer, serializeServer, type Cond, type Group } from "./conditions/conditionModel";
import { ServerGroupCards } from "./conditions/ServerGroupCards";
import { NewCondition } from "./conditions/StateGroupsEditor";
import { readActionGate, setActionGate, gateReader } from "./actionGate";




/** One action's condition row: add "only fire if…", or edit / remove an existing gate. */
function ActionGateRow({ handle, type }: { handle: NodeHandle; type: string }) {
  const store = useEditorStore();
  const spec = ACTION_SPECS[type];
  const gate = useEditorState(
    (s) => (s.files.get(handle.path), readActionGate(store, handle, type)),
    (a, b) => a?.condition === b?.condition,
  );
  const names = useCompletions(handle);
  const [adding, setAdding] = useState(false);
  if (!spec) return null;
  const write = (g: Group) => void setActionGate(store, handle, type, serializeServer(g) || null);
  const add = (c: Cond, group: Group) => {
    write({ ...group, conds: [...group.conds, c] });
    setAdding(false);
  };
  const form = (group: Group) => <NewCondition id={`action-if-${type}-new`} types={SERVER_TYPES} keysFor={() => names} onAdd={(c) => add(c, group)} onCancel={() => setAdding(false)} />;
  if (!gate)
    return adding ? (
      <BranchRow title={`${spec.label} · if`}>{form({ logic: "all", conds: [] })}</BranchRow>
    ) : (
      <AddBranchButton onClick={() => setAdding(true)}>{`${spec.label}: only fire when…`}</AddBranchButton>
    );
  const group = parseServer(gate.condition);
  return (
    <BranchRow title={`${spec.label} · if`} onRemove={() => void setActionGate(store, handle, type, null)} removeLabel="Remove condition">
      {group ? (
        <>
          <ServerGroupCards id={`action-if-${type}`} group={group} keys={names} onChange={write} />
          {adding ? form(group) : <AddBranchButton onClick={() => setAdding(true)}>Add condition</AddBranchButton>}
        </>
      ) : (
        <>
          <ExpressionField id={`action-if-${type}`} label="Only if" value={gate.condition} completions={names} onCommit={(c) => setActionGate(store, handle, type, c)} />
          <PanelNote>This expression has parts the builder can't show (brackets, mixed and / or, filters), so it's edited as Liquid.</PanelNote>
        </>
      )}
    </BranchRow>
  );
}

export function ActionConditionsEditor({ handle }: { handle: NodeHandle }) {
  const store = useEditorStore();
  const active = useEditorState(
    (s) => {
      s.files.get(handle.path);
      return handle.alive && handle.kind === "element" ? detectActiveActions(gateReader(store, handle)) : [];
    },
    (a, b) => a.join("|") === b.join("|"),
  );
  if (!active.length) return null;
  return (
    <div className="border-base-300/60 mt-2 flex flex-col gap-1.5 border-t pt-2" data-action-conditions="">
      <span className="text-base-content/70 text-[10px] font-semibold uppercase tracking-wide">Only fire when…</span>
      {active.map((type) => (
        <ActionGateRow key={type} handle={handle} type={type} />
      ))}
    </div>
  );
}
