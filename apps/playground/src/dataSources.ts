/**
 * The Liquid globals the playground's sites render with, registered so the editor's expression autocomplete
 * (`{{ prod` → `products`) offers them. Nothing queries them: the dev server previews through each site's
 * `data.json`. The built-in objects (`site`, `page`, `pages`, `request`, `routes`) come with the renderer.
 */
import type { Extension } from "@pagehub/engine";
import { defineDataSource } from "@pagehub/engine/render";

const GLOBALS = [
  "settings",
  "collections",
  "products",
  "product",
  "product_categories",
  "cart",
  "customer",
  "company",
  "year",
  "order",
] as const;

// `query` is never called: the canvas renders through `data.json`, and a data source only needs to exist to be offered.
export const devDataSources = (): Extension[] => GLOBALS.map((global) => defineDataSource({ name: global, liquid: { global }, query: async () => [] }));
