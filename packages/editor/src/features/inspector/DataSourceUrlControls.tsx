/**
 * The Data source panel's "Filter from the URL" and "Pages" sections: what the old editor's
 * `stateInputs` / `publishStateKeys` did, in HTML-first form. A URL filter narrows the list by a
 * `?param=` query value; "Insert filter form" adds the GET form that sets it; pagination wraps
 * the loop in `{% paginate %}` with Prev / Next links. All of it is plain markup (see
 * `dataSourceActions`), listed here so it can be changed or removed without reading Liquid.
 *
 *   <DataSourceUrlControls ds={ds} rows={sampleRows} onAddFilter={…} onRemoveFilter={…} … />
 */
import { useState } from "react";
import { AddBranchButton, BranchRow, ExpressionField, PanelNote } from "../liquid/LiquidFields";
import type { DataSource, UrlFilter } from "./dataSourceModel";
import { FIELD, PARAM, distinctValues } from "./dataSourceActions";

interface Props {
  ds: DataSource;
  /** Sample rows of the list (canvas data), to offer the filter form's dropdown options. */
  rows: readonly unknown[];
  onAddFilter(field: string, param: string): void;
  onRemoveFilter(f: UrlFilter): void;
  onInsertForm(f: UrlFilter, options: string[]): void;
  onAddPagination(size: number): void;
  onRemovePagination(): void;
  /** The paginate block's current page size, and the setter. */
  pageSize: string;
  onPageSize(v: string): void;
}

function NewUrlFilter({ onAdd, onCancel }: { onAdd(field: string, param: string): void; onCancel(): void }) {
  const [field, setField] = useState("");
  const [param, setParam] = useState("");
  const ok = FIELD.test(field) && PARAM.test(param);
  return (
    <div data-new-url-filter="" className="border-primary/40 flex flex-col gap-1.5 rounded-md border border-dashed p-1.5">
      <ExpressionField id="ds-url-field" label="Field" mono placeholder="categories" value={field} onCommit={(v) => (setField(v.trim()), true)} />
      <ExpressionField id="ds-url-param" label="URL parameter" mono placeholder="category" value={param} onCommit={(v) => (setParam(v.trim()), true)} />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="text-base-content/70 hover:bg-base-200 rounded-md px-2 py-1 text-[11px]">
          Cancel
        </button>
        <button type="button" disabled={!ok} onClick={() => ok && onAdd(field, param)} className="bg-primary text-primary-content rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-40">
          Add URL filter
        </button>
      </div>
    </div>
  );
}

export function DataSourceUrlControls({ ds, rows, onAddFilter, onRemoveFilter, onInsertForm, onAddPagination, onRemovePagination, pageSize, onPageSize }: Props) {
  const [adding, setAdding] = useState(false);
  return (
    <div data-ds-url-controls="" className="border-base-300/60 mt-1 flex flex-col gap-1.5 border-t pt-1.5">
      <span className="text-base-content/70 text-[10px] font-semibold">Filter from the URL</span>
      {!ds.urlFilters.length && !adding && <PanelNote>Visitors filter the list with a form: ?category=tees keeps the rows whose field matches.</PanelNote>}
      {ds.urlFilters.map((f) => (
        <BranchRow key={`${f.param}:${f.field}`} title={`?${f.param} → ${f.field}`} onRemove={() => onRemoveFilter(f)} removeLabel="Remove URL filter">
          <button type="button" onClick={() => onInsertForm(f, distinctValues(rows, f.field))} data-ds-insert-form="" className="text-primary self-start text-[11px] hover:underline">
            Insert filter form
          </button>
        </BranchRow>
      ))}
      {adding ? (
        <NewUrlFilter
          onAdd={(field, param) => (onAddFilter(field, param), setAdding(false))}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <AddBranchButton onClick={() => setAdding(true)}>Add URL filter</AddBranchButton>
      )}

      <span className="text-base-content/70 mt-1 text-[10px] font-semibold">Pages</span>
      {ds.paginate ? (
        <BranchRow title="Paginated" onRemove={onRemovePagination} removeLabel="Remove pagination">
          <ExpressionField id="ds-page-size" label="Per page" value={pageSize} onCommit={(v) => (onPageSize(v), true)} />
          <PanelNote>Prev / Next links read the page from ?page=. Inside the list, paginate.pages and paginate.current_page are available.</PanelNote>
        </BranchRow>
      ) : (
        <AddBranchButton onClick={() => onAddPagination(12)}>Add pagination</AddBranchButton>
      )}
    </div>
  );
}
