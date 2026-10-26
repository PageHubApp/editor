/** The host's block library: the Add → Blocks panel reads it through `blockSourceFacet`. */
import { defineFacet } from "../extensions/extension";

/** What a block is when it is used: the markup to insert and its card preview. */
export interface BlockDetail {
  /** The markup inserted (HTML + Liquid). */
  source: string;
  /** Rendered HTML for the card preview (sandboxed, no scripts); else the card shows the name. */
  preview?: string;
}

/**
 * A library block the host offers. A host with a small library gives `source` (and `preview`) on every item. A host
 * with a large one lists blocks without them (an index: name, category, styles) and supplies them from
 * `BlockSource.detail`, which the editor asks for when a card scrolls into view and when a block is inserted.
 */
export interface BlockItem extends Partial<BlockDetail> {
  slug: string;
  name: string;
  /** Category id (`hero`, `features`, …). */
  category: string;
  subcategory?: string;
  styles?: readonly string[];
  description?: string;
  /** The author's own block ("My blocks", first). */
  saved?: boolean;
}

export interface BlockSource {
  blocks(): readonly BlockItem[] | Promise<readonly BlockItem[]>;
  /**
   * The source and preview of a block listed without them. Asked once per block (the editor keeps the answer);
   * a rejection leaves that block's card on its name and refuses its insert. A host may batch calls made in the
   * same tick.
   */
  detail?(slug: string): Promise<BlockDetail>;
  /** Category display names by id; default the id, capitalised. */
  categoryNames?: Readonly<Record<string, string>>;
  /** The site's style: the style filter applies it until the author clears it. */
  siteStyle?: string | null;
  /** False: no Blocks tab. */
  enabled?: boolean;
}

/** The host's block library (the last one given wins). */
export const blockSourceFacet = defineFacet<BlockSource, BlockSource | null>({ id: "blockSource", combine: (values) => values.at(-1) ?? null });
