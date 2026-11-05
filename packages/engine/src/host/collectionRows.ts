/**
 * The host's collections (a site's own data tables: products, posts, team) and their entries.
 *
 * - Text or a photo in a repeated card that comes from an entry's data (`{{ item.description }}`) offers
 *   "Edit this <entry>"; the canvas knows which entry a copy shows from its `data-edit-row` (canvas-only) attribute.
 * - `collections()` tells the editor which collections exist and what fields they have, so lists are added and bound
 *   by picking names (the source picker, the Add panel's collection list, field pickers) instead of typing Liquid.
 * - `createEntry` / `createCollection` hand the owner to the host's own forms.
 *
 * Without a host (`null`) the editor only explains where the text comes from and offers free-text sources.
 */
import { defineFacet } from "../extensions/extension";

/** One entry, as the button names it. */
export interface CollectionRowLabel {
  /** The collection's display name ("Produits"). */
  collection: string;
  /** The entry's title, its first text field ("T-shirt technique"). */
  title: string;
}

/** A collection field's kind (the dashboard's field types). Unknown kinds behave like `text`. */
export type CollectionFieldKind =
  | "text"
  | "richText"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "image"
  | "media"
  | "url"
  | "email"
  | "color"
  | "json"
  | "ref"
  | "computed";

export interface CollectionFieldInfo {
  /** The key Liquid reads (`item.<key>`). */
  key: string;
  /** What the owner calls it ("Price"). */
  label: string;
  kind: CollectionFieldKind;
}

export interface CollectionInfo {
  /** `collections.<slug>` in Liquid. */
  slug: string;
  /** Display name ("Produits"). */
  name: string;
  fields: readonly CollectionFieldInfo[];
  /** How many entries it has (0 = empty: offer "Add an entry"). */
  count: number;
}

export interface CollectionRows {
  /** What to call the entry `rowId` on the button; null when the host doesn't know it (no button then). */
  describe(rowId: string): CollectionRowLabel | null | Promise<CollectionRowLabel | null>;
  /** Open the entry for editing, at `field` when given. The host refreshes the canvas data after a save. */
  open(ref: { rowId: string; field?: string | null }): void;
  /** The site's collections, with their fields. Absent: the editor offers only free-text sources. */
  collections?(): readonly CollectionInfo[] | Promise<readonly CollectionInfo[]>;
  /** Open a blank entry form for the collection `slug`. The host refreshes the canvas data after a save. */
  createEntry?(slug: string): void;
  /** Open the host's new-collection flow (the editor re-reads `collections()` when the canvas data reloads). */
  createCollection?(): void;
}

/** The host's collections (the last one given wins). */
export const collectionRowsFacet = defineFacet<CollectionRows, CollectionRows | null>({ id: "collectionRows", combine: (values) => values.at(-1) ?? null });
