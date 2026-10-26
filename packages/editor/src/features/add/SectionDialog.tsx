/**
 * The Add Section dialog (`insert.sectionDialog`): a Modal 80vh tall over the whole window. A
 * category rail (All, My blocks when there are saved ones, then the host's categories) with the
 * search at its foot, and a grid of block previews at 0.2. A click inserts the block — at the
 * pending above / below position if one was given, else the end of the page — closes the
 * dialog, and 100ms later scrolls the canvas smoothly to the new block. "Custom" marks the
 * author's own blocks.
 */
import { useMemo, useState } from "react";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { addPanelOf } from "./addPanelState";
import { type BlockItem } from "@pagehub/engine/host";
import { insertBlockLazy } from "./insertTarget";
import { InlineError } from "../../primitives/InlineError";
import { Skeleton, SkeletonRegion } from "../../primitives/Skeleton";
import { blockCategories, filterBlocks, useBlocks } from "./useBlocks";
import { elementsFor } from "../canvas/frameDom";
import { Modal } from "../../primitives/Modal";
import { LazyBlockPreview } from "./BlockCards";
import { SearchInput } from "./panelParts";

const SCROLL_TO_NEW_MS = 100;
const RAIL = "flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors";

export function SectionDialog() {
  const store = useEditorStore();
  const run = useRunCommand();
  const open = useEditorState((s) => addPanelOf(s).dialog);
  const { source, blocks, error, retry } = useBlocks();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const all = blocks ?? [];
  const categories = useMemo(() => blockCategories(all, source?.categoryNames), [all, source]);
  const list = useMemo(() => filterBlocks(all, { category, query }), [all, category, query]);
  const close = () => void run("insert.sectionDialogClose");

  const pick = async (block: BlockItem) => {
    if (!(await insertBlockLazy(store, source, block))) return;
    run("insert.sectionDialogClose");
    setTimeout(() => {
      const h = store.state.selection.primary;
      const doc = document.querySelector<HTMLIFrameElement>("[data-canvas-frame]")?.contentDocument;
      if (doc && h?.alive && h.kind === "element") elementsFor(doc, editSrcOf(h))[0]?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, SCROLL_TO_NEW_MS);
  };

  return (
    <Modal isOpen={open} onClose={close} ariaLabel="Add section" size="xl" zIndex={100} className="flex h-[80vh] flex-col overflow-hidden p-0">
      <div data-section-dialog="" className="flex min-h-0 flex-1">
        <nav aria-label="Block categories" className="border-base-300 flex w-52 shrink-0 flex-col border-r">
          <div className="scrollbar flex-1 overflow-y-auto p-2">
            {[{ id: null, name: "All", total: all.length }, ...categories].map((c) => (
              <button key={c.id ?? "all"} type="button" data-section-category={c.id ?? "all"} aria-current={category === c.id} onClick={() => setCategory(c.id)} className={`${RAIL} ${category === c.id ? "bg-primary text-primary-content" : "hover:bg-base-200"}`}>
                <span className="truncate">{c.name}</span>
                <span className="text-xs opacity-60">{c.total}</span>
              </button>
            ))}
          </div>
          <div className="border-base-300 border-t p-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search blocks..." />
          </div>
        </nav>
        <div className="scrollbar min-w-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <InlineError message={`Could not load blocks: ${error}`} onRetry={retry} />
          ) : blocks === null ? (
            <SkeletonRegion label="Loading blocks" className="grid grid-cols-3 gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}</SkeletonRegion>
          ) : list.length === 0 ? (
            <div data-section-empty="" className="text-base-content/60 flex h-full items-center justify-center text-sm">No blocks found</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {list.map((b) => (
                <button key={b.slug} type="button" data-section-block={b.slug} onClick={() => pick(b)} className="group border-base-300 bg-base-200 hover:border-primary relative flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left">
                  <div className="relative h-40 overflow-hidden">
                    <LazyBlockPreview block={b} scale={0.2} />
                    {b.saved && <kbd className="text-base-content/60 border-base-content/20 bg-base-200/95 absolute top-2 right-2 z-10 rounded-sm border border-dashed px-1 py-px font-mono text-[9px] leading-none">Custom</kbd>}
                  </div>
                  <span className="border-base-300 bg-base-100 truncate border-t px-2.5 py-2 text-xs font-medium">{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
