/**
 * The host's collection entries: text or a photo in a repeated card that comes from an entry's data (`{{ item.description }}`)
 * offers "Edit this <entry>", and the host opens that entry. The canvas knows which entry a copy shows from its
 * `data-edit-row` (canvas-only) attribute. Without a host (`null`) the editor only explains where the text comes from.
 */
import { defineFacet } from "../extensions/extension";

/** One entry, as the button names it. */
export interface CollectionRowLabel {
  /** The collection's display name ("Produits"). */
  collection: string;
  /** The entry's title, its first text field ("T-shirt technique"). */
  title: string;
}

export interface CollectionRows {
  /** What to call the entry `rowId` on the button; null when the host doesn't know it (no button then). */
  describe(rowId: string): CollectionRowLabel | null | Promise<CollectionRowLabel | null>;
  /** Open the entry for editing, at `field` when given. The host refreshes the canvas data after a save. */
  open(ref: { rowId: string; field?: string | null }): void;
}

/** The host's collection entries (the last one given wins). */
export const collectionRowsFacet = defineFacet<CollectionRows, CollectionRows | null>({ id: "collectionRows", combine: (values) => values.at(-1) ?? null });
