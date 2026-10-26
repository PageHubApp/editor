/**
 * The font catalogue: the families the font picker lists, supplied by the host (the default is
 * a curated Google Fonts list). The rich-text font panel reads the same facet.
 */
import { defineFacet } from "../extensions/extension";
import { DEFAULT_FONT_FAMILIES } from "./fonts.data";

export type FontCategory = "sans-serif" | "serif" | "display" | "handwriting" | "monospace";

export interface FontFamily {
  family: string;
  category: FontCategory;
}

export interface FontCatalogue {
  families(): readonly FontFamily[] | Promise<readonly FontFamily[]>;
  /** Make a family usable in the editor's preview (inject its stylesheet). Optional. */
  load?(family: string, weights?: readonly string[]): void;
}

export const defaultFontCatalogue: FontCatalogue = { families: () => DEFAULT_FONT_FAMILIES };

/** The configured catalogue, else the curated list. */
export const fontCatalogueFacet = defineFacet<FontCatalogue, FontCatalogue>({ id: "fontCatalogue", combine: (values) => values[0] ?? defaultFontCatalogue });

/** The picker's category tabs, in order. */
export const FONT_TABS = ["All Fonts", "Popular", "Serif", "Sans Serif", "Display", "Handwriting", "Monospace"] as const;
export type FontTab = (typeof FONT_TABS)[number];

const TAB_CATEGORY: Partial<Record<FontTab, FontCategory>> = { Serif: "serif", "Sans Serif": "sans-serif", Display: "display", Handwriting: "handwriting", Monospace: "monospace" };

/** The families of a tab (`Popular` is the first 20 of the catalogue's order). */
export function fontsInTab(all: readonly FontFamily[], tab: FontTab): readonly FontFamily[] {
  if (tab === "All Fonts") return all;
  if (tab === "Popular") return all.slice(0, 20);
  return all.filter((f) => f.category === TAB_CATEGORY[tab]);
}
