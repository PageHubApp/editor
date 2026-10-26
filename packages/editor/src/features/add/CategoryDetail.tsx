/**
 * One block category: back arrow, name + total, the Style and Filter (subcategory) dropdowns
 * (opening one closes the other), the paged single-column card list ("No blocks in this
 * category." when empty), the Quick Look, and previous / next category buttons at the foot.
 * With no style chosen, the site style applies when the category has blocks in it (marked
 * auto-applied) until the author clears the style this session.
 */
import { useMemo, useState } from "react";
import { useRunCommand } from "../../react/bindings";
import { Icon } from "../../primitives/icons";
import type { AddPanelState } from "./addPanelState";
import type { BlockItem } from "@pagehub/engine/host";
import { filterBlocks, type BlockCategory } from "./useBlocks";
import { BlockCards, useQuickLook } from "./BlockList";
import { FilterDropdown, PanelHeaderRow, PanelScrollSpacer } from "./panelParts";

export function CategoryDetail({ category, categories, blocks, panel, siteStyle }: { category: BlockCategory; categories: readonly BlockCategory[]; blocks: readonly BlockItem[]; panel: AddPanelState; siteStyle: string | null }) {
  const run = useRunCommand();
  const [open, setOpen] = useState<"style" | "sub" | null>(null);
  const auto = !panel.style && !panel.styleCleared && !!siteStyle && category.styles.some((s) => s.name === siteStyle);
  const style = panel.style ?? (auto ? siteStyle : null);
  const list = useMemo(() => filterBlocks(blocks, { category: category.id, sub: panel.sub, style }), [blocks, category.id, panel.sub, style]);
  const quick = useQuickLook(list);
  const i = categories.findIndex((c) => c.id === category.id);
  const prev = i > 0 ? categories[i - 1] : null;
  const next = i < categories.length - 1 ? categories[i + 1] : null;

  const go = (cat: string) => run("insert.set", { category: cat, sub: null, style: null, query: "" });
  return (
    <div data-category-detail={category.id} className="relative flex flex-1 flex-col overflow-hidden">
      <PanelHeaderRow>
        <button type="button" data-add-back="" onClick={() => run("insert.set", { category: null, sub: null })} className="hover:bg-base-200 cursor-pointer rounded-md p-1 transition-colors" aria-label="Back">
          <Icon name="arrow-left" className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="text-sm font-medium">{category.name}</div>
          <span className="text-base-content/60 text-xs">{category.total}</span>
        </div>
        {category.styles.length > 0 && (
          <FilterDropdown label="Style" icon="palette" value={style} autoApplied={auto} open={open === "style"} onOpenChange={(o) => setOpen(o ? "style" : null)} items={category.styles} onSelect={(n) => (run("insert.set", { style: n, styleCleared: false }), setOpen(null))} onClear={() => run("insert.set", { style: null, styleCleared: true })} />
        )}
        {category.subcategories.length > 0 && (
          <FilterDropdown label="Filter" value={panel.sub} open={open === "sub"} onOpenChange={(o) => setOpen(o ? "sub" : null)} items={category.subcategories} onSelect={(n) => (run("insert.set", { sub: n }), setOpen(null))} onClear={() => run("insert.set", { sub: null })} />
        )}
      </PanelHeaderRow>
      <div className="scrollbar flex-1 overflow-y-auto">
        <BlockCards blocks={list} quick={quick} />
        {list.length === 0 && (
          <div className="flex h-32 items-center justify-center">
            <p className="text-base-content/60 text-sm">No blocks in this category.</p>
          </div>
        )}
        <PanelScrollSpacer />
      </div>
      {quick.overlay}
      {quick.hint}
      {(prev || next) && (
        <div className="border-base-300 flex items-stretch border-t">
          {prev ? (
            <button type="button" data-category-prev={prev.id} onClick={() => go(prev.id)} className="hover:bg-base-200 flex flex-1 cursor-pointer items-center gap-1.5 px-3 py-4 text-left transition-colors">
              <span className="text-base-content/60 shrink-0"><Icon name="chevron-left" className="size-3.5" /></span>
              <span className="text-base-content/60 min-w-0 truncate text-xs font-medium">{prev.name}</span>
            </button>
          ) : (
            <div className="flex-1" />
          )}
          {prev && next && <div className="bg-base-300 w-px" />}
          {next ? (
            <button type="button" data-category-next={next.id} onClick={() => go(next.id)} className="hover:bg-base-200 flex flex-1 cursor-pointer items-center justify-end gap-1.5 px-3 py-4 text-right transition-colors">
              <span className="text-base-content/60 min-w-0 truncate text-xs font-medium">{next.name}</span>
              <span className="text-base-content/60 shrink-0"><Icon name="chevron-right" className="size-3.5" /></span>
            </button>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      )}
    </div>
  );
}
