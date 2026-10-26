/**
 * The host's block library, loaded once per source (sync or async), grouped into categories:
 * "My blocks" first when the author has saved blocks, then hero, features, content, cta,
 * testimonials, team, pricing, newsletter, contact, faq, commerce, navigation, social-proof,
 * then the rest in the order they appear. Each category counts its blocks, subcategories and
 * styles. `filterBlocks` narrows by category, subcategory, style and a query.
 */
import { useEffect, useState } from "react";
import { useEditorState } from "../../react/bindings";
import { blockSourceFacet, type BlockItem, type BlockSource } from "@pagehub/engine/host";

const MY_BLOCKS = "my-blocks";

export const CATEGORY_ORDER = ["hero", "features", "content", "cta", "testimonials", "team", "pricing", "newsletter", "contact", "faq", "commerce", "navigation", "social-proof"];

interface FacetCount {
  name: string;
  count: number;
}

export interface BlockCategory {
  id: string;
  name: string;
  total: number;
  subcategories: FacetCount[];
  styles: FacetCount[];
}

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const counts = (values: Iterable<string>): FacetCount[] => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
};

export const categoryOf = (b: BlockItem): string => (b.saved ? MY_BLOCKS : b.category);

export function blockCategories(blocks: readonly BlockItem[], names: Readonly<Record<string, string>> = {}): BlockCategory[] {
  const ids = [...new Set(blocks.map(categoryOf))];
  const rank = (id: string) => (id === MY_BLOCKS ? -1 : CATEGORY_ORDER.includes(id) ? CATEGORY_ORDER.indexOf(id) : CATEGORY_ORDER.length + ids.indexOf(id));
  return ids
    .sort((a, b) => rank(a) - rank(b))
    .map((id) => {
      const list = blocks.filter((b) => categoryOf(b) === id);
      return {
        id,
        name: id === MY_BLOCKS ? "My blocks" : (names[id] ?? capital(id.replace(/-/g, " "))),
        total: list.length,
        subcategories: counts(list.flatMap((b) => (b.subcategory ? [b.subcategory] : []))),
        styles: counts(list.flatMap((b) => b.styles ?? [])),
      };
    });
}

export function filterBlocks(blocks: readonly BlockItem[], f: { category?: string | null; sub?: string | null; style?: string | null; query?: string }): BlockItem[] {
  const q = f.query?.trim().toLowerCase();
  return blocks.filter(
    (b) =>
      (!f.category || categoryOf(b) === f.category) &&
      (!f.sub || b.subcategory === f.sub) &&
      (!f.style || (b.styles ?? []).includes(f.style)) &&
      (!q || [b.name, b.slug, b.category, b.subcategory, b.description].some((s) => s?.toLowerCase().includes(q))),
  );
}

const loaded = new WeakMap<BlockSource, readonly BlockItem[]>();

/** The source's blocks (`null` while loading), the source itself, and a load error (with `retry`). */
export function useBlocks(): { source: BlockSource | null; blocks: readonly BlockItem[] | null; error: string | null; retry(): void } {
  const source = useEditorState((s) => s.facet(blockSourceFacet));
  const [blocks, setBlocks] = useState<readonly BlockItem[] | null>(() => (source ? (loaded.get(source) ?? null) : []));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!source) return void setBlocks([]);
    const have = loaded.get(source);
    if (have) return void setBlocks(have);
    let live = true;
    setBlocks(null);
    setError(null);
    void Promise.resolve()
      .then(() => source.blocks())
      .then(
        (list) => {
          loaded.set(source, list);
          if (live) setBlocks(list);
        },
        (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => void (live = false);
  }, [source, attempt]);
  return { source, blocks, error, retry: () => setAttempt((n) => n + 1) };
}
