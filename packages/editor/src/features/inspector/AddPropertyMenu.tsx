/**
 * The "+" on a section header: add properties that have no value yet.
 *
 *   <AddPropertyMenu ref={menu} candidates={model.candidates} onAdd={add} onOpenPopover={open} />
 *
 * - Nothing to add → renders nothing.
 * - One candidate → a direct button (tooltip = its help). A popover-type candidate opens its
 *   popover instead of dropping an empty row.
 * - Several → a searchable multi-select popover with checkboxes and "Add (N)"; an empty list
 *   reads "All properties added".
 * - `ref.open()` does what a click on the "+" does (a click on an empty section's header).
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { RowDef } from "./rows/inspectorRows";
import { Icon } from "../../primitives/icons";
import { SearchableMenuPopover, type SearchableMenuItem, type SearchableMenuPopoverHandle } from "../../primitives/SearchableMenuPopover";
import { tooltip } from "../../primitives/tooltip";

interface AddPropertyMenuProps {
  candidates: readonly RowDef[];
  /** Rows picked, in click order. */
  onAdd(rows: RowDef[]): void;
  onOpenPopover(row: RowDef): void;
}

export interface AddPropertyMenuHandle {
  open(): void;
}

/** The multi-select's empty-list text. */
export const ALL_ADDED = "All properties added";

const item = (r: RowDef): SearchableMenuItem<RowDef> => ({ id: r.id, label: r.label, help: r.help, keywords: r.keywords, data: r });

export const AddPropertyMenu = forwardRef<AddPropertyMenuHandle, AddPropertyMenuProps>(function AddPropertyMenu({ candidates, onAdd, onOpenPopover }, ref) {
  const menu = useRef<SearchableMenuPopoverHandle>(null);
  const only = candidates.length === 1 ? candidates[0]! : null;
  const pickOnly = () => (only!.popover ? onOpenPopover(only!) : onAdd([only!]));
  useImperativeHandle(ref, () => ({ open: () => (only ? pickOnly() : menu.current?.open()) }), [only, candidates]);

  if (!candidates.length) return null;
  if (only)
    return (
      <button
        type="button"
        data-add-property=""
        onClick={pickOnly}
        aria-label={`Add ${only.label}`}
        {...tooltip(only.help)}
        className="text-base-content/60 hover:text-base-content hover:bg-base-200 flex size-4 shrink-0 items-center justify-center rounded-md opacity-70 transition-[color,background-color,opacity] hover:opacity-100"
      >
        <Icon name="plus" className="size-3.5" />
      </button>
    );
  return (
    <SearchableMenuPopover<RowDef>
      ref={menu}
      trigger={<Icon name="plus" className="size-3.5" />}
      triggerAriaLabel="Add property"
      items={candidates.map(item)}
      onSelect={(i) => onAdd([i.data!])}
      multiSelect
      onSelectMany={(xs) => onAdd(xs.map((i) => i.data!))}
      emptyMessage={ALL_ADDED}
    />
  );
});
