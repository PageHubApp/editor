/**
 * Block cards. A block card shows the host's rendered preview (a sandboxed frame at 0.35, no
 * scripts) over its name, "custom" on the author's own blocks; it drags onto the canvas
 * (`useInsertDrag` with the block's markup and slug), inserts on double-click, and reports its
 * hover for the Quick Look (a press on a card closes the Quick Look). The category card is the
 * Blocks home tile ("N blocks · M types", "X of N" and dimmed at 0 when a style filter is on).
 * The Quick Look is the hovered block at 0.65, min(900px, 85vw) wide, zoomed from its card.
 */
import { useEffect, useRef, useState } from "react";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { useInsertDrag } from "../dnd/useInsertDrag";
import { useOverlay } from "../../primitives/overlayStack";
import { Icon } from "../../primitives/icons";
import { Skeleton } from "../../primitives/Skeleton";
import { blockSourceFacet, type BlockItem } from "@pagehub/engine/host";
import { useBlockDetail, useNearViewport, type BlockDetailStatus } from "./blockDetail";
import { insertBlockLazy } from "./insertTarget";
import type { BlockCategory } from "./useBlocks";
import { CATEGORY_WIREFRAMES } from "./categoryWireframes";
import { insertHint } from "./ComponentsTab";

const PREVIEW_WIDTH = 1280;

/** The block's preview frame at `scale`; the name while it is loading or when the host has no preview for it. */
export function BlockPreview({ block, scale, status = "ready" }: { block: BlockItem; scale: number; status?: BlockDetailStatus }) {
  if (status === "loading") return <Skeleton className="h-full w-full" />;
  if (!block.preview) return <div data-block-preview="none" className="text-base-content/60 flex h-full items-center justify-center text-xs">{block.name}</div>;
  return (
    <iframe
      data-block-preview=""
      aria-label={`${block.name} preview`}
      sandbox=""
      srcDoc={block.preview}
      tabIndex={-1}
      className="pointer-events-none origin-top-left border-0"
      style={{ width: PREVIEW_WIDTH, height: 800, transform: `scale(${scale})` }}
    />
  );
}

/** A preview that asks the host for its block's detail when it nears the viewport (the Add Section dialog's grid, the Quick Look). */
export function LazyBlockPreview({ block, scale, now = false }: { block: BlockItem; scale: number; now?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  const { block: full, status } = useBlockDetail(block, now || near);
  return (
    <div ref={ref} className="h-full w-full">
      <BlockPreview block={full} scale={scale} status={status} />
    </div>
  );
}

export function BlockCard({ block, quickLookOpen, onHover, onPress }: { block: BlockItem; quickLookOpen: boolean; onHover(block: BlockItem, rect: DOMRect): void; onPress(): void }) {
  const store = useEditorStore();
  const source = useEditorState((s) => s.facet(blockSourceFacet));
  const card = useRef<HTMLDivElement>(null);
  const near = useNearViewport(card);
  const { block: full, status } = useBlockDetail(block, near);
  const drag = useInsertDrag({ snippet: full.source, block: block.slug }, block.name, status === "ready");
  return (
    <div
      ref={card}
      {...insertHint(block.description)}
      role="button"
      tabIndex={0}
      aria-label={block.name}
      data-block-card={block.slug}
      data-create-type="section"
      data-pressed={drag.pressed ? "" : undefined}
      onPointerDown={(e) => {
        onPress();
        drag.onPointerDown(e); // a card whose source hasn't arrived starts its drag once it has
      }}
      onDoubleClick={() => void insertBlockLazy(store, source, block)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && void insertBlockLazy(store, source, block)}
      onMouseEnter={() => card.current && onHover(block, card.current.getBoundingClientRect())}
      className={`group border-base-300 bg-base-200 text-base-content hover:border-primary/50 relative flex cursor-grab flex-col overflow-hidden rounded-lg border hover:shadow-sm active:cursor-grabbing ${quickLookOpen ? "ring-primary/30 ring-2" : ""}`}
    >
      <div className="relative h-28 overflow-hidden">
        <BlockPreview block={full} scale={0.35} status={status} />
        {block.saved && <kbd className="text-base-content/60 border-base-content/20 bg-base-200/95 absolute top-2 right-2 z-10 rounded-sm border border-dashed px-1 py-px font-mono text-[9px] leading-none">custom</kbd>}
        <div className="bg-primary/10 pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="border-base-300 bg-base-100 border-t px-2.5 py-2">
        <p className="truncate text-xs font-medium">{block.name}</p>
      </div>
    </div>
  );
}

export function CategoryCard({ category, filteredCount, onClick }: { category: BlockCategory; filteredCount: number | null; onClick(): void }) {
  const filtered = filteredCount !== null;
  const plural = (n: number) => (n === 1 ? "block" : "blocks");
  return (
    <button type="button" data-category-card={category.id} data-dimmed={filtered && filteredCount === 0 ? "" : undefined} onClick={onClick} className={`group border-base-300 bg-base-200 hover:border-primary flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left hover:shadow-md ${filtered && filteredCount === 0 ? "opacity-40" : ""}`}>
      <div className="bg-neutral/50 flex h-24 items-center justify-center overflow-hidden">
        {CATEGORY_WIREFRAMES[category.id] ?? <span className="text-base-content/60 text-xs">{category.name}</span>}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-base-content text-sm font-medium">{category.name}</div>
          <div data-category-count="" className="text-base-content/60 text-xs">
            {filtered ? `${filteredCount} of ${category.total} ${plural(category.total)}` : `${category.total} ${plural(category.total)}`}
            {category.subcategories.length > 0 && ` · ${category.subcategories.length} types`}
          </div>
        </div>
        <span className="text-base-content/60 shrink-0 transition-transform group-hover:translate-x-0.5"><Icon name="chevron-right" className="size-4" /></span>
      </div>
    </button>
  );
}

export function QuickLook({ block, origin, onClose }: { block: BlockItem; origin: DOMRect | null; onClose(): void }) {
  const [shown, setShown] = useState(false);
  useOverlay({ id: "block-quick-look", isOpen: true, onDismiss: onClose });
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div data-quick-look={block.slug} className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="border-base-300 bg-base-100 pointer-events-auto flex max-h-[85vh] w-[min(900px,85vw)] flex-col overflow-hidden rounded-xl border shadow-2xl transition-all duration-200 ease-out"
        style={{ transformOrigin: origin ? `${origin.left + origin.width / 2}px ${origin.top + origin.height / 2}px` : undefined, opacity: shown ? 1 : 0, transform: shown ? "scale(1)" : "scale(0.92)" }}
      >
        <div className="border-base-300 flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <span className="text-base-content flex-1 text-sm font-medium">{block.name}</span>
          <kbd className="bg-base-200 text-base-content/60 rounded px-1.5 py-0.5 text-[10px] font-medium">Space</kbd>
        </div>
        <div className="h-[60vh] min-h-0 overflow-x-hidden overflow-y-auto">
          <LazyBlockPreview block={block} scale={0.65} now />
        </div>
      </div>
    </div>
  );
}
