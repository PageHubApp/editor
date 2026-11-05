/**
 * "Edit this entry": a rendered copy of a repeated element that shows a collection entry's data carries that entry's id
 * (`data-edit-row`, canvas-only) and the fields it shows (`data-edit-field`). With a host that knows its entries
 * (`collectionRowsFacet`), the canvas overlay and the rich-text notice offer a button that opens that exact entry:
 * the one way to change one product card's text or photo without changing every card.
 */
import { useEffect, useMemo, useState } from "react";
import { EDIT_ATTRIBUTES } from "@pagehub/engine";
import { collectionRowsFacet, type CollectionRowLabel, type CollectionRows } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";

/** The entry a rendered copy shows, and the entry fields it shows (in `data-edit-field` order). */
export interface EntryRef {
  rowId: string;
  fields: readonly string[];
}

/** The entry `el` (a rendered copy) shows: the nearest `data-edit-row`; empty means none. */
export function entryOf(el: Element | null | undefined): EntryRef | null {
  if (!el) return null;
  const rowId = el.closest(`[${EDIT_ATTRIBUTES.row}]`)?.getAttribute(EDIT_ATTRIBUTES.row)?.trim();
  if (!rowId) return null;
  const fields = (el.closest(`[${EDIT_ATTRIBUTES.field}]`)?.getAttribute(EDIT_ATTRIBUTES.field) ?? "").split(/\s+/).filter(Boolean);
  return { rowId, fields };
}

/** `product_type` → "Product type". */
export const fieldLabel = (field: string): string => {
  const words = field.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export interface EntryLink {
  rows: CollectionRows;
  rowId: string;
  label: CollectionRowLabel;
}

/** The host's label for `rowId` (sync or async `describe`); null with no host, no row, or an entry the host doesn't know. */
export function useEntryLink(rowId: string | null | undefined): EntryLink | null {
  const rows = useEditorState((s) => s.facet(collectionRowsFacet));
  const described = useMemo(() => {
    if (!rows || !rowId) return null;
    try {
      return rows.describe(rowId);
    } catch {
      return null;
    }
  }, [rows, rowId]);
  const [resolved, setResolved] = useState<{ for: unknown; label: CollectionRowLabel | null } | null>(null);
  useEffect(() => {
    if (!(described instanceof Promise)) return;
    let live = true;
    described.then(
      (label) => live && setResolved({ for: described, label }),
      () => live && setResolved({ for: described, label: null }),
    );
    return () => void (live = false);
  }, [described]);
  const label = described instanceof Promise ? (resolved?.for === described ? resolved.label : null) : described;
  return rows && rowId && label ? { rows, rowId, label } : null;
}

interface EntryButtonProps {
  link: EntryLink;
  /** The field to open the entry at. */
  field: string | null;
  /** A photo: the button says "Change photo of …" (deleting it here would remove it from every copy). */
  photo?: boolean;
  className?: string;
}

export function EntryButton({ link, field, photo = false, className = "" }: EntryButtonProps) {
  const { title, collection } = link.label;
  const text = photo ? `Change photo of "${title}"` : `Edit "${title}"`;
  const hint = photo
    ? `Opens this entry in ${collection}. Deleting the photo here would remove it from every copy.`
    : `Opens this entry in ${collection}. Changes there show on this copy only.`;
  return (
    <button
      type="button"
      data-edit-entry={link.rowId}
      data-edit-entry-field={field ?? ""}
      className={`max-w-56 truncate ${className}`}
      {...tooltip(hint, "bottom")}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => link.rows.open({ rowId: link.rowId, field })}
    >
      {text}
    </button>
  );
}
