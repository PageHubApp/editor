/**
 * One condition's fields (key, operator, value — or signed in / out for an auth status) and the
 * all / any switch of a group. Fields commit on Enter / blur, so one change is one undo step.
 *
 *   <ConditionCard cond={c} onChange={write} onRemove={drop} keys={stateKeys} />
 *   <LogicSwitch value="all" onChange={setLogic} />
 */
import type { ReactNode } from "react";
import { Icon } from "../../../primitives/icons";
import { tooltip } from "../../../primitives/tooltip";
import { ExpressionField } from "../../liquid/LiquidFields";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { NO_VALUE, OPS_BY_TYPE, OP_LABELS, TYPE_HELP, TYPE_LABELS, type Cond, type CondType, type Logic, type Op } from "./conditionModel";

const KEY_LABEL: Record<CondType, string> = {
  "url-param": "Parameter",
  "form-field": "Field name",
  connector: "Path",
  company: "Field",
  device: "Device",
  auth: "Field",
  item: "Field",
  localStorage: "Key",
  state: "Key",
};

const KEY_PLACEHOLDER: Partial<Record<CondType, string>> = {
  "url-param": "ref",
  "form-field": "email",
  connector: "collections.plants.size",
  company: "logo",
  auth: "isMember",
  item: "image",
  localStorage: "consent",
  state: "cart:open",
};

/** Customer fields the auth condition offers (status = signed in / out). */
export const AUTH_FIELDS = ["status", "isMember", "hasSubscription", "orderCount", "email", "name", "plans.pro", "plans.starter"];

export function LogicSwitch({ value, onChange, id }: { value: Logic; onChange(v: Logic): void; id: string }) {
  return (
    <ToolbarItemView
      type="radio"
      inputId={`logic-${id}`}
      label="Match"
      value={value}
      onChange={(v) => onChange(v === "any" ? "any" : "all")}
      options={[
        { value: "all", label: "All", hint: "Every condition must hold" },
        { value: "any", label: "Any", hint: "One condition is enough" },
      ]}
    />
  );
}

interface CardProps {
  cond: Cond;
  /** Stable id for the fields (`input-<id>-…`). */
  id: string;
  onChange(next: Cond): void;
  onRemove?(): void;
  /** Completions for the key field. */
  keys?: readonly string[];
  footer?: ReactNode;
}

export function ConditionCard({ cond, id, onChange, onRemove, keys, footer }: CardProps) {
  const status = cond.type === "auth" && (cond.key === "status" || !cond.key);
  const set = (patch: Partial<Cond>) => onChange({ ...cond, ...patch });
  return (
    <div data-condition={cond.type} className="border-base-300/70 bg-base-100 flex flex-col gap-1.5 rounded-md border p-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base-content/70 truncate text-[11px] font-medium" {...tooltip(TYPE_HELP[cond.type], "top")}>
          {TYPE_LABELS[cond.type]}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove condition" {...tooltip("Remove condition", "top")} className="text-base-content/50 hover:text-error flex size-6 shrink-0 items-center justify-center rounded transition-colors">
            <Icon name="trash" className="size-3.5" />
          </button>
        )}
      </div>
      {cond.type === "auth" && (
        <ExpressionField id={`${id}-key`} label={KEY_LABEL.auth} mono={false} value={cond.key || "status"} completions={AUTH_FIELDS} onCommit={(k) => set(k === "status" || !k ? { key: "status", op: "equals", value: "logged-in" } : { key: k, op: cond.key === "status" ? "exists" : cond.op })} />
      )}
      {status ? (
        <ToolbarItemView type="radio" inputId={`${id}-status`} label="Visitor" value={cond.value === "logged-out" ? "logged-out" : "logged-in"} onChange={(v) => set({ op: "equals", value: v })} options={[{ value: "logged-in", label: "Signed in" }, { value: "logged-out", label: "Signed out" }]} />
      ) : (
        <>
          {cond.type !== "auth" && <ExpressionField id={`${id}-key`} label={KEY_LABEL[cond.type]} placeholder={KEY_PLACEHOLDER[cond.type]} value={cond.key} completions={keys} onCommit={(k) => (k ? set({ key: k }) : false)} />}
          <ToolbarItemView type="select" inputId={`${id}-op`} label="Is" value={cond.op} onChange={(v) => set({ op: v as Op, value: NO_VALUE.has(v as Op) ? "" : cond.value })}>
            {OPS_BY_TYPE[cond.type].map((o) => (
              <option key={o} value={o}>
                {OP_LABELS[o]}
              </option>
            ))}
          </ToolbarItemView>
          {!NO_VALUE.has(cond.op) && <ExpressionField id={`${id}-value`} label="Value" mono={false} value={cond.value} onCommit={(v) => set({ value: v })} />}
        </>
      )}
      {footer}
    </div>
  );
}
