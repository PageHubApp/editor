/**
 * Browser-decided condition groups (state / local storage / form field), OR'd together, each all / any — the
 * editor for one `test()` expression (`data-state-show`, a `data-state-class` entry's gate). And
 * the "add a condition" form both this and the Conditions section use.
 *
 *   <StateGroupsEditor id="show" groups={parseShow(v)!} onChange={(gs) => write(serializeShow(gs))} keys={keys} />
 *   <NewCondition types={["state"]} keysFor={() => keys} onAdd={add} onCancel={close} />
 */
import { useState } from "react";
import { AddBranchButton } from "../../liquid/LiquidFields";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { ConditionCard, LogicSwitch } from "./ConditionFields";
import { TYPE_LABELS, newCond, type Cond, type CondType, type Group } from "./conditionModel";

export const BROWSER_TYPES: CondType[] = ["state", "localStorage", "form-field"];

/** The "Add condition" form: pick a type, fill it, Add. */
export function NewCondition({ types, onAdd, onCancel, keysFor, id = "new-condition" }: { types: CondType[]; onAdd(c: Cond): void; onCancel(): void; keysFor(t: CondType): readonly string[]; id?: string }) {
  const [draft, setDraft] = useState<Cond | null>(types.length === 1 ? newCond(types[0]!) : null);
  const ready = !!draft && (draft.type === "auth" || draft.type === "device" || !!draft.key);
  return (
    <div data-new-condition="" className="border-primary/40 flex flex-col gap-1.5 rounded-md border border-dashed p-1.5">
      {types.length > 1 && (
        <ToolbarItemView type="select" inputId={`${id}-type`} label="Type" value={draft?.type ?? ""} placeholder="Choose…" onChange={(t) => setDraft(t ? newCond(t as CondType) : null)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </ToolbarItemView>
      )}
      {draft && draft.type === "device" && (
        <ToolbarItemView type="radio" inputId={`${id}-device`} label="Show on" value={draft.value} onChange={(v) => setDraft({ ...draft, value: v })} options={[{ value: "mobile", label: "Phone" }, { value: "desktop", label: "Desktop" }]} />
      )}
      {draft && draft.type !== "device" && <ConditionCard id={id} cond={draft} onChange={setDraft} keys={keysFor(draft.type)} />}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="text-base-content/70 hover:bg-base-200 rounded-md px-2 py-1 text-[11px]">
          Cancel
        </button>
        <button type="button" disabled={!ready} onClick={() => draft && onAdd(draft)} className="bg-primary text-primary-content rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-40">
          Add condition
        </button>
      </div>
    </div>
  );
}

interface Props {
  /** Field-id prefix (unique per editor on screen). */
  id: string;
  groups: readonly Group[];
  onChange(groups: Group[]): void;
  keys: readonly string[];
}

export function StateGroupsEditor({ id, groups, onChange, keys }: Props) {
  const [adding, setAdding] = useState<number | null>(null);
  const patch = (gi: number, g: Group | null) => onChange(groups.map((x, j) => (j === gi ? g : x)).filter((x): x is Group => !!x && x.conds.length > 0));
  const add = (gi: number, c: Cond) => {
    onChange(gi >= groups.length ? [...groups, { logic: "all", conds: [c] }] : groups.map((x, j) => (j === gi ? { ...x, conds: [...x.conds, c] } : x)));
    setAdding(null);
  };
  const form = (gi: number) => <NewCondition id={`${id}-new-${gi}`} types={BROWSER_TYPES} keysFor={() => keys} onAdd={(c) => add(gi, c)} onCancel={() => setAdding(null)} />;
  return (
    <div data-state-groups={id} className="flex flex-col gap-1.5">
      {groups.map((g, gi) => (
        <div key={gi} data-condition-group={gi} className="flex flex-col gap-1.5">
          {gi > 0 && <span className="text-base-content/60 text-center text-[10px] font-semibold uppercase">or</span>}
          <div className="bg-base-200/50 flex flex-col gap-1.5 rounded-md p-1.5">
            {g.conds.length > 1 && <LogicSwitch id={`${id}-${gi}`} value={g.logic} onChange={(logic) => patch(gi, { ...g, logic })} />}
            {g.conds.map((c, i) => (
              <ConditionCard
                key={`${gi}:${i}:${c.type}`}
                id={`${id}-${gi}-${i}`}
                cond={c}
                keys={keys}
                onChange={(n) => patch(gi, { ...g, conds: g.conds.map((y, k) => (k === i ? n : y)) })}
                onRemove={() => patch(gi, { ...g, conds: g.conds.filter((_, k) => k !== i) })}
              />
            ))}
            {adding === gi ? form(gi) : <AddBranchButton onClick={() => setAdding(gi)}>And condition</AddBranchButton>}
          </div>
        </div>
      ))}
      {adding === groups.length ? form(groups.length) : <AddBranchButton onClick={() => setAdding(groups.length)}>{groups.length ? "Or group" : "Add condition"}</AddBranchButton>}
    </div>
  );
}
