/**
 * The Blocks tab. Home: search + the Style filter over a 2-column grid of category cards
 * ("My blocks" first). The site style applies until the author clears it (marked auto-applied);
 * with a style on, cards read "X of N" and dim at 0. From 2 characters the search shows
 * results grouped by category "(n)", paged 6 at a time, or "No blocks found for "q"". A card
 * opens its category. Loading shows skeleton cards the size of the real ones.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { addPanelOf } from "./addPanelState";
import { blockCategories, categoryOf, filterBlocks, useBlocks } from "./useBlocks";
import { InlineError } from "../../primitives/InlineError";
import { Skeleton, SkeletonRegion } from "../../primitives/Skeleton";
import { BlockCard, CategoryCard } from "./BlockCards";
import { useQuickLook, usePaging } from "./BlockList";
import { CategoryDetail } from "./CategoryDetail";
import { FilterDropdown, PanelHeaderRow, PanelScrollSpacer, SearchInput } from "./panelParts";

const BLOCK_SEARCH_MIN = 2;

export function BlocksTab() {
  const run = useRunCommand();
  const panel = useEditorState((s) => addPanelOf(s));
  const { source, blocks, error, retry } = useBlocks();
  const [styleOpen, setStyleOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [panel.category]);
  const all = blocks ?? [];
  const categories = useMemo(() => blockCategories(all, source?.categoryNames), [all, source]);
  const siteStyle = source?.siteStyle ?? null;
  const style = panel.style ?? (panel.styleCleared ? null : siteStyle);
  const searching = panel.query.trim().length >= BLOCK_SEARCH_MIN;
  const results = useMemo(() => (searching ? filterBlocks(all, { query: panel.query, style }) : []), [all, searching, panel.query, style]);
  const { count, sentinel } = usePaging(results.length, results);
  const quick = useQuickLook(results);

  const category = !searching && panel.category ? categories.find((c) => c.id === panel.category) : undefined;
  if (category) return <CategoryDetail category={category} categories={categories} blocks={all} panel={panel} siteStyle={siteStyle} />;

  const styles = [...new Map(categories.flatMap((c) => c.styles).map((s) => [s.name, 0]))].map(([name]) => ({ name, count: categories.reduce((n, c) => n + (c.styles.find((s) => s.name === name)?.count ?? 0), 0) })).sort((a, b) => a.name.localeCompare(b.name));
  const groups = [...new Set(results.slice(0, count).map(categoryOf))].map((id) => ({ id, name: categories.find((c) => c.id === id)?.name ?? id, list: results.slice(0, count).filter((b) => categoryOf(b) === id), total: results.filter((b) => categoryOf(b) === id).length }));

  return (
    <div data-add-blocks="" className="relative flex flex-1 flex-col overflow-hidden">
      <PanelHeaderRow>
        <SearchInput ref={input} value={panel.query} onChange={(q) => run("insert.set", { query: q })} placeholder="Search blocks..." />
        {styles.length > 0 && (
          <FilterDropdown label="Style" icon="palette" value={style} autoApplied={!panel.style && !!style} open={styleOpen} onOpenChange={setStyleOpen} items={styles} onSelect={(n) => (run("insert.set", { style: n, styleCleared: false }), setStyleOpen(false))} onClear={() => run("insert.set", { style: null, styleCleared: true })} />
        )}
      </PanelHeaderRow>
      <div className="scrollbar flex-1 overflow-y-auto">
        {searching ? (
          results.length === 0 ? (
            <div data-block-results="none" className="text-base-content/60 flex h-32 items-center justify-center px-4 text-center text-sm">No blocks found for "{panel.query.trim()}"</div>
          ) : (
            <div data-block-results="" onMouseLeave={quick.onLeave}>
              {groups.map((g) => (
                <div key={g.id} data-result-group={g.id}>
                  <div className="text-base-content/70 mt-3 mb-1 ml-4 text-xs font-bold">{`${g.name} (${g.total})`}</div>
                  <div className="grid w-full grid-cols-1 gap-3 p-3 pt-1">
                    {g.list.map((b) => (
                      <BlockCard key={b.slug} block={b} quickLookOpen={quick.open?.slug === b.slug} onHover={quick.onHover} onPress={() => quick.open && quick.close()} />
                    ))}
                  </div>
                </div>
              ))}
              {sentinel}
            </div>
          )
        ) : error ? (
          <InlineError message={`Could not load blocks: ${error}`} onRetry={retry} />
        ) : blocks === null ? (
          <SkeletonRegion label="Loading blocks" className="grid grid-cols-2 gap-2.5 p-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[9.5rem] rounded-xl" />)}
          </SkeletonRegion>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 p-3">
            {categories.map((c) => (
              <CategoryCard key={c.id} category={c} filteredCount={style && c.id !== "my-blocks" ? (c.styles.find((s) => s.name === style)?.count ?? 0) : null} onClick={() => run("insert.set", { category: c.id, sub: null, query: "" })} />
            ))}
          </div>
        )}
        <PanelScrollSpacer />
      </div>
      {quick.overlay}
      {searching && quick.hint}
    </div>
  );
}
