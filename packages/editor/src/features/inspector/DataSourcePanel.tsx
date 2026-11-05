/**
 * DataSourcePanel — the data-source control for the inspector's "Data source" row
 * (Container / Data): a provider/collection + filter + sort + limit/skip + scope/split panel.
 *
 *   <DataSourcePanel handle={containerHandle} />
 *
 * Binding is a `{% for item in collection %}` wrapper around the element. The collection,
 * item name, limit/offset/reversed args and the empty (`{% else %}`) branch live on the loop;
 * filter / sort / split ride on a managed `{% assign %}` the panel keeps in step (see
 * `dataSourceModel`). Every write goes through the engine (`liquid.*` commands and the edit
 * transaction), so each is one undo step and renders through the real runtime.
 */
import { useState, type ReactNode } from "react";
import { type NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { AddBranchButton, BranchRow, ExpressionField, PanelNote } from "../liquid/LiquidFields";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { buildFor, buildPaginate, markupOf, parseFor, parsePaginate, wrapperOf } from "../liquid/markup";
import { useCommit, useCommitAt } from "../liquid/useCommit";
import { useBranches, useCompletions } from "../liquid/BlockPanels";
import { buildPipeline, forInner, readDataSource, type DataSource, type UrlFilter, type WhereClause } from "./dataSourceModel";
import { filterFormMarkup, paginatedMarkup, urlFilterMarkup } from "./dataSourceActions";
import { DataSourceUrlControls } from "./DataSourceUrlControls";
import { SortField, SourceSelect, WhereRow, sampleAt, useSources } from "./DataSourceFields";

/** Same data source: primitives equal and the same handles (JSON would walk each handle's registry). */
const sameSource = (a: DataSource | null, b: DataSource | null): boolean =>
  a === b ||
  (!!a && !!b && a.assign === b.assign && a.paginate === b.paginate && a.urlFilters.length === b.urlFilters.length && a.urlFilters.every((f, i) => f.handle === b.urlFilters[i]!.handle) && JSON.stringify({ ...a, assign: 0, paginate: 0, anchor: 0, urlFilters: 0 }) === JSON.stringify({ ...b, assign: 0, paginate: 0, anchor: 0, urlFilters: 0 }));

/**
 * Liquid fields kept as a fallback. With a host that lists collections they fold into "Edit as Liquid" (picking by
 * name is the main path); without one they show, as the only way to name a source the editor doesn't know.
 */
function LiquidFallback({ folded, children }: { folded: boolean; children: ReactNode }) {
  if (!folded) return <>{children}</>;
  return (
    <details data-ds-advanced="" className="group">
      <summary className="text-base-content/60 hover:text-base-content cursor-pointer text-[11px] select-none">Edit as Liquid</summary>
      <div className="mt-1.5 flex flex-col gap-1.5">{children}</div>
    </details>
  );
}

/** The source-picker shown before an element is bound to data. */
function SourcePicker({ handle }: { handle: NodeHandle }) {
  const commit = useCommit();
  const sources = useSources(handle);
  const names = useCompletions(handle);
  const start = (collection: string) => commit("liquid.wrapFor", { item: "item", collection, at: handle });
  const host = sources.host;
  return (
    <div className="flex flex-col gap-1.5" data-data-source="unbound">
      <PanelNote>Pick a collection and this element repeats once for each entry.</PanelNote>
      {host?.loaded && !host.list.length && <PanelNote>This site has no collections yet.</PanelNote>}
      <SourceSelect sources={sources} value="" onPick={start} />
      <LiquidFallback folded={!!host}>
        <ExpressionField id="ds-custom" label="Liquid" value="" placeholder="collections.team" completions={names} onCommit={(v) => (v ? start(v) : true)} />
      </LiquidFallback>
    </div>
  );
}

/** The bound panel: the full set of controls over an existing `{% for %}` + its managed assign. */
function BoundPanel({ handle, wrapper }: { handle: NodeHandle; wrapper: NodeHandle }) {
  const store = useEditorStore();
  const commit = useCommit();
  const commitAt = useCommitAt(wrapper);
  const sources = useSources(handle);
  const names = useCompletions(wrapper);
  const branches = useBranches(wrapper);
  const ds = useEditorState<DataSource | null>(
    () => (store.state.files.get(wrapper.path), readDataSource(wrapper)),
    sameSource,
  );
  // Local draft of the filter rows, so an empty / in-progress row stays visible even though the
  // source only records filled filters. Re-seed from source when the two diverge (undo, reselect).
  const [draft, setDraft] = useState<WhereClause[]>(ds?.where ?? []);
  const draftFilled = draft.filter((w) => w.prop.trim());
  if (ds && JSON.stringify(draftFilled) !== JSON.stringify(ds.where)) setDraft(ds.where);
  if (!ds) return <PanelNote>This loop is written in a form the panel can't edit; use the code view.</PanelNote>;

  const varName = (base: string) => {
    // `collections.team` → teamRows; `products` → productsRows
    const head = /^collections\.([\w-]+)/.exec(base)?.[1]?.replace(/-/g, "_") ?? base.replace(/\..*$/, "");
    const id = /([a-z_]\w*)\s*$/i.exec(head)?.[1];
    return id ? `${id}Rows` : "rows";
  };

  /** Rewrite the loop head (collection + item + reversed), keeping limit/offset args (the tail). */
  const setHead = (patch: { collection?: string; item?: string; reversed?: boolean }) => {
    const parts = parseFor(forInner(wrapper));
    if (!parts) return;
    commit("liquid.setMarkup", { markup: buildFor({ ...parts, ...patch }), at: wrapper });
  };

  const setBase = (base: string) => {
    if (!base.trim()) return;
    if (ds.assign) {
      // base lives in the assign RHS; the loop keeps reading the var
      const rhs = buildPipeline({ ...ds, base });
      store.dispatch((tr) => tr.replace(ds.assign!, `{% assign ${ds.var} = ${rhs} %}`));
    } else setHead({ collection: base });
  };

  /** Apply a change to the filter pipeline (where / sort / split), managing the assign sibling. */
  const setFilters = (next: Pick<DataSource, "where" | "sort" | "split">) => {
    // URL filters narrow the same variable, so it stays even with no where / sort / split.
    const rhs = buildPipeline({ base: ds.base, ...next }) ?? (ds.urlFilters.length ? ds.base : null);
    const parts = parseFor(forInner(wrapper));
    if (!parts) return;
    if (rhs) {
      if (ds.assign) {
        store.dispatch((tr) => tr.replace(ds.assign!, `{% assign ${ds.var} = ${rhs} %}`));
      } else {
        const v = varName(ds.base);
        // Insert the managed assign before the loop, then point the loop at its variable.
        store.dispatch((tr) => tr.insert({ before: ds.anchor }, `{% assign ${v} = ${rhs} %}\n  `));
        setHead({ collection: v });
        setPaginateList(v);
      }
    } else if (ds.assign) {
      // no filters left: drop the assign and read the base directly
      store.dispatch((tr) => tr.remove(ds.assign!));
      setHead({ collection: ds.base });
      setPaginateList(ds.base);
    }
  };

  /** Point the `{% paginate %}` block (if any) at the list the loop now reads. */
  const setPaginateList = (list: string) => {
    const p = ds.paginate ? parsePaginate(markupOf(store.state.files.get(ds.paginate.path) ?? "", ds.paginate)) : null;
    if (ds.paginate && p) commit("liquid.setMarkup", { markup: buildPaginate({ ...p, list }), at: ds.paginate });
  };

  /** The variable the loop reads, creating the managed `{% assign %}` when the loop reads the base directly. */
  const addUrlFilter = (field: string, param: string) => {
    if (ds.assign) {
      store.dispatch((tr) => tr.insert({ before: ds.anchor }, `${urlFilterMarkup(ds.var!, field, param)}\n  `));
      return;
    }
    const v = varName(ds.base);
    store.dispatch((tr) => tr.insert({ before: ds.anchor }, `{% assign ${v} = ${ds.base} %}\n  ${urlFilterMarkup(v, field, param)}\n  `));
    setHead({ collection: v });
    setPaginateList(v);
  };

  /** The GET form goes above the list's container (the grid the rows repeat in), else above the assign. */
  const insertForm = (f: UrlFilter, options: string[]) => {
    const above = ds.anchor.parent();
    const target = above && above.kind === "element" ? above : (ds.assign ?? ds.anchor);
    store.dispatch((tr) => tr.insert({ before: target }, filterFormMarkup(f.param, f.field, options)));
  };

  const loopList = () => parseFor(forInner(wrapper))?.collection ?? ds.base;
  const addPagination = (size: number) => {
    const [open, close] = paginatedMarkup(loopList(), size);
    store.dispatch((tr) => tr.wrap(wrapper, open, close));
  };
  const removePagination = () => {
    const nav = ds.paginate?.children().find((c) => c.kind === "element" && c.tag === "nav" && c.text().includes("paginate."));
    if (nav) store.dispatch((tr) => tr.remove(nav));
    if (ds.paginate) commit("liquid.unwrap", { at: ds.paginate });
  };
  const pageSize = ds.paginate ? (parsePaginate(markupOf(store.state.files.get(ds.paginate.path) ?? "", ds.paginate))?.by ?? "") : "";
  const setPageSize = (by: string) => {
    const p = ds.paginate ? parsePaginate(markupOf(store.state.files.get(ds.paginate.path) ?? "", ds.paginate)) : null;
    if (ds.paginate && p && by.trim()) commit("liquid.setMarkup", { markup: buildPaginate({ ...p, by: by.trim() }), at: ds.paginate });
  };
  const sampleRows = (() => {
    const v = sampleAt((store as { data?: Record<string, unknown> }).data, ds.base);
    return Array.isArray(v) ? v : [];
  })();

  /** Update the draft filter rows and write the filled ones to source. */
  const writeWhere = (rows: WhereClause[]) => {
    setDraft(rows);
    setFilters({ where: rows.filter((w) => w.prop.trim()), sort: ds.sort, split: ds.split });
  };

  const setArg = (name: string, value: string) => commitAt("liquid.setArg", { name, value });
  const stop = () => {
    for (const f of ds.urlFilters) store.dispatch((tr) => tr.remove(f.handle));
    if (ds.assign) store.dispatch((tr) => tr.remove(ds.assign!));
    commit("liquid.unwrap", { at: wrapper });
  };

  const currentSource = sources.options.find((c) => c.value === ds.base)?.value ?? "";
  const coll = sources.collection(ds.base);
  const fields = coll?.fields;
  // "Split text at" turns a text value into a list; a list source has nothing to split.
  const showSplit = !!ds.split || !sources.isList(ds.base);

  return (
    <div className="flex flex-col gap-1.5" data-data-source="bound">
      <SourceSelect sources={sources} value={currentSource} onPick={setBase} current={!currentSource && <option value="">Other: {ds.base}</option>} />
      <LiquidFallback folded={!!coll}>
        <ExpressionField id="ds-base" label="Collection" value={ds.base} completions={names} onCommit={(v) => (setBase(v), true)} />
        <ExpressionField id="ds-item" label="Call each entry" value={ds.item} onCommit={(v) => (setHead({ item: v }), true)} />
      </LiquidFallback>

      {/* Filter by metadata (managed assign | where: …) — draft rows persist while empty. */}
      <div className="border-base-300/60 mt-1 flex flex-col gap-1.5 border-t pt-1.5">
        <span className="text-base-content/70 text-[10px] font-semibold">Show only entries where</span>
        {draft.map((w, i) => (
          <WhereRow
            key={i}
            index={i}
            clause={w}
            fields={fields}
            rows={sampleRows}
            onChange={(patch) => writeWhere(draft.map((c, j) => (j === i ? { ...c, ...patch } : c)))}
            onRemove={() => writeWhere(draft.filter((_, j) => j !== i))}
          />
        ))}
        <AddBranchButton onClick={() => setDraft([...draft, { prop: "", value: "" }])}>Add filter</AddBranchButton>
      </div>

      <SortField value={ds.sort} fields={fields} onCommit={(v) => setFilters({ where: draftFilled, sort: v, split: ds.split })} />
      {showSplit && <ExpressionField id="ds-split" label="Split text at" value={ds.split} placeholder="e.g. ," mono onCommit={(v) => (setFilters({ where: draftFilled, sort: ds.sort, split: v }), true)} />}

      <ExpressionField id="ds-limit" label="Show at most" value={ds.limit} placeholder="All" onCommit={(v) => (setArg("limit", v), true)} />
      <ExpressionField id="ds-offset" label="Skip the first" value={ds.offset} placeholder="0" onCommit={(v) => (setArg("offset", v), true)} />
      <ToolbarItemView key={String(ds.reversed)} label="Reverse order" inputId="ds-reversed" type="toggle" on="on" value={ds.reversed ? "on" : ""} onChange={(v) => setHead({ reversed: !!v })} />

      <DataSourceUrlControls
        ds={ds}
        rows={sampleRows}
        onAddFilter={addUrlFilter}
        onRemoveFilter={(f) => void store.dispatch((tr) => tr.remove(f.handle))}
        onInsertForm={insertForm}
        onAddPagination={addPagination}
        onRemovePagination={removePagination}
        pageSize={pageSize}
        onPageSize={setPageSize}
      />

      {branches.includes("else") ? (
        <BranchRow title="Empty" onRemove={() => commitAt("liquid.removeBranch", { index: branches.indexOf("else") })} removeLabel="Remove empty state">
          <PanelNote>Shown when the collection has no entries.</PanelNote>
        </BranchRow>
      ) : (
        <AddBranchButton onClick={() => commitAt("liquid.addBranch", { branch: "else" })}>Add empty state</AddBranchButton>
      )}

      <button type="button" onClick={stop} className="text-error/80 hover:bg-error/10 mt-1 rounded-md border border-dashed border-current/30 px-2 py-1 text-[11px]" data-ds-stop="">
        Stop repeating
      </button>
      <span className="text-base-content/45 text-[10px]">To show an entry's details, select text or a photo inside and pick a field.</span>
    </div>
  );
}

export function DataSourcePanel({ handle }: { handle: NodeHandle }) {
  // The `{% for %}` block that wraps this element, re-read whenever its file changes.
  const wrapper = useEditorState((s) => (handle.alive ? (s.files.get(handle.path), wrapperOf(handle, ["for"])) : null));
  if (wrapper) return <BoundPanel handle={handle} wrapper={wrapper} />;
  return <SourcePicker handle={handle} />;
}
