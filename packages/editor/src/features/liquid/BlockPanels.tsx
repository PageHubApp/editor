/**
 * Panels for Liquid blocks. Every control writes through one command — the loop
 * head, a condition, a branch, the page size, the partial name through `liquid.setMarkup`;
 * named arguments (`limit`, `offset`, a partial's variables) through `liquid.setArg`;
 * branches through `liquid.addBranch` / `liquid.removeBranch` — and each commit is one undo
 * step (`useCommitAt`).
 *
 *   <ForPanel handle={h} />   // {% for item in list reversed limit: n offset: n %} … {% else %}
 */
import { useMemo, useState } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { AddBranchButton, BranchRow, ExpressionField, PanelNote } from "./LiquidFields";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { dataSourceGlobals, expressionCompletions } from "./completions";
import { branchNames, buildFor, buildNamed, buildPaginate, markupOf, parseFor, parseNamed, parsePaginate } from "./markup";
import { useCommitAt } from "./useCommit";

export interface BlockPanelProps {
  handle: NodeHandle;
}

export function useMarkup(h: NodeHandle, branch = 0): string {
  return useEditorState((s) => markupOf(s.files.get(h.path) ?? "", h, branch));
}

export function useBranches(h: NodeHandle): string[] {
  return useEditorState(() => branchNames(h).join(" ")).split(" ").filter(Boolean);
}

/** Autocomplete names at `h` (loop variables, sample data, site objects). */
export function useCompletions(h: NodeHandle): string[] {
  const store = useEditorStore();
  const data = (store as { data?: Record<string, unknown> }).data;
  const source = useEditorState((s) => s.files.get(h.path));
  const config = useEditorState((s) => s.config);
  return useMemo(() => expressionCompletions(h.alive ? h : null, data, dataSourceGlobals(config)), [h, data, source, config]);
}

/** A dashed "add" trigger that turns into a field; the commit adds the thing. */
export function PendingAdd({ label, field, onAdd, completions }: { label: string; field: string; onAdd(value: string): boolean; completions?: readonly string[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <AddBranchButton onClick={() => setOpen(true)}>{label}</AddBranchButton>;
  return (
    <ExpressionField
      id={`pending-${label}`}
      label={field}
      value=""
      completions={completions}
      autoFocus
      onCommit={(v) => {
        if (!v) return void setOpen(false);
        const ok = onAdd(v);
        if (ok) setOpen(false);
        return ok;
      }}
    />
  );
}

/** The trailing branches of an if / unless / case block, and the buttons that add them. */
function Branches({ handle, kind }: { handle: NodeHandle; kind: "elsif" | "when" }) {
  const commit = useCommitAt(handle);
  const branches = useBranches(handle);
  const names = useCompletions(handle);
  return (
    <>
      {branches.map((name, i) => (i === 0 ? null : <BranchRowFor key={`${i}:${name}`} handle={handle} index={i} name={name} completions={names} />))}
      <PendingAdd label={kind === "when" ? "Add when" : "Add elsif"} field={kind === "when" ? "When" : "Else if"} completions={names} onAdd={(v) => commit("liquid.addBranch", { branch: kind, markup: v })} />
      {!branches.includes("else") && <AddBranchButton onClick={() => commit("liquid.addBranch", { branch: "else" })}>Add else</AddBranchButton>}
    </>
  );
}

function BranchRowFor({ handle, index, name, completions }: { handle: NodeHandle; index: number; name: string; completions: readonly string[] }) {
  const commit = useCommitAt(handle);
  const markup = useMarkup(handle, index);
  return (
    <BranchRow title={name} onRemove={() => commit("liquid.removeBranch", { index })} removeLabel={`Remove ${name} branch`}>
      {name !== "else" && <ExpressionField id={`branch-${index}`} label={name === "when" ? "When" : "Else if"} value={markup} completions={completions} onCommit={(v) => commit("liquid.setMarkup", { branch: index, markup: v })} />}
    </BranchRow>
  );
}

export function ConditionPanel({ handle }: BlockPanelProps) {
  const commit = useCommitAt(handle);
  const markup = useMarkup(handle);
  const names = useCompletions(handle);
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel={handle.tag}>
      <ExpressionField id="condition" label={handle.tag === "unless" ? "Unless" : "If"} value={markup} completions={names} placeholder="customer" onCommit={(v) => commit("liquid.setMarkup", { markup: v })} />
      <Branches handle={handle} kind="elsif" />
    </div>
  );
}

export function CasePanel({ handle }: BlockPanelProps) {
  const commit = useCommitAt(handle);
  const markup = useMarkup(handle);
  const names = useCompletions(handle);
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel="case">
      <ExpressionField id="case-value" label="Value" value={markup} completions={names} onCommit={(v) => commit("liquid.setMarkup", { markup: v })} />
      <Branches handle={handle} kind="when" />
    </div>
  );
}

export function ForPanel({ handle }: BlockPanelProps) {
  const commit = useCommitAt(handle);
  const markup = useMarkup(handle);
  const args = useEditorState(() => Object.fromEntries(handle.alive ? handle.args().map((a) => [a.name, a.source]) : []), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const branches = useBranches(handle);
  const names = useCompletions(handle);
  const parts = parseFor(markup);
  if (!parts) return <PanelNote>This loop is written in a form the panel can't edit; use the code view.</PanelNote>;
  const head = (patch: Partial<typeof parts>) => commit("liquid.setMarkup", { markup: buildFor({ ...parts, ...patch }) });
  const arg = (name: string) => (v: string) => commit("liquid.setArg", { name, value: v });
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel="for">
      <ExpressionField id="for-collection" label="List" value={parts.collection} completions={names} onCommit={(v) => head({ collection: v })} />
      <ExpressionField id="for-item" label="Item name" value={parts.item} onCommit={(v) => head({ item: v })} />
      <ExpressionField id="for-limit" label="Limit" value={args.limit ?? ""} placeholder="All" onCommit={arg("limit")} />
      <ExpressionField id="for-offset" label="Skip" value={args.offset ?? ""} placeholder="0" onCommit={arg("offset")} />
      <ToolbarItemView key={String(parts.reversed)} label="Reversed" inputId="for-reversed" type="toggle" on="on" value={parts.reversed ? "on" : ""} onChange={(v) => head({ reversed: !!v })} />
      {branches.includes("else") ? (
        <BranchRow title="else" onRemove={() => commit("liquid.removeBranch", { index: branches.indexOf("else") })} removeLabel="Remove else branch">
          <PanelNote>Shown when the list is empty.</PanelNote>
        </BranchRow>
      ) : (
        <AddBranchButton onClick={() => commit("liquid.addBranch", { branch: "else" })}>Add else (empty list)</AddBranchButton>
      )}
    </div>
  );
}

export function PaginatePanel({ handle }: BlockPanelProps) {
  const commit = useCommitAt(handle);
  const markup = useMarkup(handle);
  const names = useCompletions(handle);
  const parts = parsePaginate(markup);
  if (!parts) return <PanelNote>This pagination is written in a form the panel can't edit; use the code view.</PanelNote>;
  const set = (patch: Partial<typeof parts>) => commit("liquid.setMarkup", { markup: buildPaginate({ ...parts, ...patch }) });
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel="paginate">
      <ExpressionField id="paginate-list" label="List" value={parts.list} completions={names} onCommit={(v) => set({ list: v })} />
      <ExpressionField id="paginate-by" label="Per page" value={parts.by} onCommit={(v) => set({ by: v })} />
      <PanelNote>Inside, `paginate.pages` and `paginate.next` describe the pages.</PanelNote>
    </div>
  );
}

/** The quoted name a form / render / section tag starts with. */
function NameField({ handle, label }: { handle: NodeHandle; label: string }) {
  const commit = useCommitAt(handle);
  const parts = parseNamed(useMarkup(handle));
  if (!parts) return null;
  return (
    <ExpressionField
      id={`${handle.tag}-name`}
      label={label}
      value={parts.name}
      onCommit={(v) => {
        const markup = buildNamed({ ...parts, name: v });
        return !!markup && commit("liquid.setMarkup", { markup });
      }}
    />
  );
}

export function FormPanel({ handle }: BlockPanelProps) {
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel="form">
      <NameField handle={handle} label="Form" />
      <PanelNote>The site handles the submission: `contact`, `customer_login`, a collection's slug …</PanelNote>
    </div>
  );
}
