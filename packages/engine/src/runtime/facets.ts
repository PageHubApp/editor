/** Facets the runtime half contributes through: tags and filters by name (a second registration is a config error). */
import { defineFacet, uniqueBy } from "../extensions/extension";
import type { TagDef } from "./defineTag";
import type { FilterDef } from "./defineFilter";

export const tagsFacet = defineFacet<TagDef, ReadonlyMap<string, TagDef>>({ id: "runtime.tags", combine: uniqueBy<TagDef>("tag", (t) => t.name) });
export const filtersFacet = defineFacet<FilterDef, ReadonlyMap<string, FilterDef>>({ id: "runtime.filters", combine: uniqueBy<FilterDef>("filter", (f) => f.name) });
