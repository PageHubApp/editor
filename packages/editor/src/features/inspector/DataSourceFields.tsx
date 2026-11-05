/**
 * The Data source panel's pickers: where the list comes from (`useSources`: the site's collections by name when the
 * host lists them, the store / page globals and the canvas data's lists), and the filter / sort rows, which become
 * field pickers when the list is a known collection.
 *
 *   const sources = useSources(handle);
 *   <SourceSelect sources={sources} value={ds.base} onPick={setBase} />
 *   <WhereRow index={0} clause={w} fields={coll?.fields} rows={sampleRows} onChange={…} onRemove={…} />
 */
import { useMemo, type ReactNode } from "react";
import { type NodeHandle } from "@pagehub/engine";
import type { CollectionFieldInfo, CollectionInfo } from "@pagehub/engine/host";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { BranchRow, ExpressionField } from "../liquid/LiquidFields";
import { loopVariables } from "../liquid/completions";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { collectionFor, useHostCollections, type HostCollections } from "../canvas/hostCollections";
import { distinctValues } from "./dataSourceActions";
import type { WhereClause } from "./dataSourceModel";

/** Store and page lists the renderer always provides (`collections` itself is an object of lists, so it isn't one). */
const LIST_GLOBALS: readonly { value: string; label: string }[] = [
  { value: "products", label: "Products" },
  { value: "product_categories", label: "Product categories" },
  { value: "pages", label: "Pages" },
];

/** The Source option that opens the host's new-collection flow instead of binding. */
export const NEW_COLLECTION = "__ph_new_collection__";

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

export interface Sources {
  options: { value: string; label: string }[];
  host: HostCollections | null;
  /** The host collection a source expression names. */
  collection(base: string): CollectionInfo | null;
  /** True when the source is a list (so "Split text at" has nothing to split). */
  isList(base: string): boolean;
}

/** Read `a.b.c` from the canvas sample data. */
export function sampleAt(data: unknown, path: string): unknown {
  let v = data;
  for (const k of path.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

/** Where a list can come from: host collections, the canvas data's lists, the list globals, and loop scopes. */
export function useSources(handle: NodeHandle): Sources {
  const store = useEditorStore();
  const data = (store as { data?: Record<string, unknown> }).data ?? {};
  const host = useHostCollections();
  const loops = useEditorState(() => (handle.alive ? loopVariables(handle) : []), (a, b) => a.join(",") === b.join(","));
  const list = host?.list;
  return useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    const add = (value: string, label: string) => {
      if (value && !seen.has(value)) {
        seen.add(value);
        options.push({ value, label });
      }
    };
    for (const c of list ?? []) add(`collections.${c.slug}`, `${c.name} (${entries(c.count)})`);
    for (const [k, v] of Object.entries(data)) if (Array.isArray(v)) add(k, LIST_GLOBALS.find((g) => g.value === k)?.label ?? k);
    for (const g of LIST_GLOBALS) add(g.value, g.label);
    // Nested scope: iterate a field of the enclosing loop item.
    for (const lv of loops) add(`${lv}.`, `A list inside each ${lv}…`);
    const collection = (base: string) => (list ? collectionFor(list, base) : null);
    const isList = (base: string) => seen.has(base) || !!collection(base) || Array.isArray(sampleAt(data, base));
    return { options, host, collection, isList };
  }, [data, list, loops, host]);
}

/** The Source dropdown; "New collection…" opens the host's form when it has one. */
export function SourceSelect({ sources, value, current, onPick }: { sources: Sources; value: string; current?: ReactNode; onPick(v: string): void }) {
  const create = sources.host?.rows.createCollection;
  return (
    <ToolbarItemView
      label="Source"
      inputId="ds-source"
      type="select"
      value={value}
      valueCoalesce=""
      placeholder="Pick a collection…"
      onChange={(v) => {
        if (v === NEW_COLLECTION) create?.();
        else if (v) onPick(v);
      }}
    >
      {current}
      {sources.options.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
      {create && <option value={NEW_COLLECTION}>New collection…</option>}
    </ToolbarItemView>
  );
}

/** A field picker over a collection's fields (labels shown, keys written). */
function FieldSelect({ id, label, value, fields, placeholder, none, onChange }: { id: string; label: string; value: string; fields: readonly CollectionFieldInfo[]; placeholder?: string; none?: string; onChange(key: string): void }) {
  const known = fields.some((f) => f.key === value);
  return (
    <ToolbarItemView label={label} inputId={id} type="select" value={value} valueCoalesce="" placeholder={placeholder} onChange={(v) => onChange(String(v ?? ""))}>
      {none !== undefined && <option value="">{none}</option>}
      {value && !known && <option value={value}>{value}</option>}
      {fields.map((f) => (
        <option key={f.key} value={f.key}>{f.label}</option>
      ))}
    </ToolbarItemView>
  );
}

/** Sort: a field picker for a known collection, else a property name. */
export function SortField({ value, fields, onCommit }: { value: string; fields?: readonly CollectionFieldInfo[]; onCommit(v: string): void }) {
  if (fields) return <FieldSelect id="ds-sort" label="Sort by" value={value} fields={fields} none="" onChange={onCommit} />;
  return <ExpressionField id="ds-sort" label="Sort by" value={value} placeholder="None" onCommit={(v) => (onCommit(v), true)} />;
}

/** One filter: Field + Is. Known collection: the field is picked by name; Yes / No and choice fields offer their values. */
export function WhereRow({ index, clause, fields, rows, onChange, onRemove }: { index: number; clause: WhereClause; fields?: readonly CollectionFieldInfo[]; rows: readonly unknown[]; onChange(patch: Partial<WhereClause>): void; onRemove(): void }) {
  const field = fields?.find((f) => f.key === clause.prop);
  const title = field?.label ?? (clause.prop || "New filter");
  const pickField = (key: string) => {
    const f = fields?.find((x) => x.key === key);
    onChange(f?.kind === "boolean" ? { prop: key, value: "true", bare: true } : { prop: key, value: "", bare: false });
  };
  const choices = field?.kind === "select" ? distinctValues(rows, field.key) : [];
  const setText = (v: string) => onChange({ value: v, bare: field?.kind === "number" && /^-?\d+(?:\.\d+)?$/.test(v) });
  return (
    <BranchRow title={title} onRemove={onRemove} removeLabel="Remove filter">
      {fields ? (
        <FieldSelect id={`ds-where-prop-${index}`} label="Field" value={clause.prop} fields={fields} placeholder="Pick a field" onChange={pickField} />
      ) : (
        <ExpressionField id={`ds-where-prop-${clause.prop}`} label="Field" value={clause.prop} mono onCommit={(v) => (onChange({ prop: v }), true)} />
      )}
      {field?.kind === "boolean" ? (
        <ToolbarItemView label="Is" inputId={`ds-where-val-${index}`} type="select" value={clause.value} onChange={(v) => onChange({ value: String(v), bare: true })}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </ToolbarItemView>
      ) : choices.length ? (
        <ToolbarItemView label="Is" inputId={`ds-where-val-${index}`} type="select" value={clause.value} valueCoalesce="" placeholder="Pick a value" onChange={(v) => onChange({ value: String(v ?? ""), bare: false })}>
          {clause.value && !choices.includes(clause.value) && <option value={clause.value}>{clause.value}</option>}
          {choices.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </ToolbarItemView>
      ) : (
        <ExpressionField id={fields ? `ds-where-val-${index}` : `ds-where-val-${clause.prop}`} label="Is" value={clause.value} mono={!fields} onCommit={(v) => (setText(v), true)} />
      )}
    </BranchRow>
  );
}
