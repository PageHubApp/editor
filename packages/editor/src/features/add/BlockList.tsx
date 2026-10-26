/**
 * A list of block cards, 6 at a time: a sentinel 240px before the end loads 6 more (search
 * results page the same way; the grouping respects the page size so more keep appearing).
 * Hovering a card records it for the Quick Look (Space, `insert.quickLook`); while
 * the Quick Look is open, hovering another card switches it, and Space, Esc or a press on a
 * card closes it. "Space to preview" shows under the hovered list until the first Quick Look.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { readJSON, writeJSON } from "../../primitives/storage";
import { addPanelOf } from "./addPanelState";
import { type BlockItem } from "@pagehub/engine/host";
import { BlockCard, QuickLook } from "./BlockCards";

const BLOCK_PAGE_SIZE = 6;
const HINT_KEY = "quick-look-used";

/** The first `count` items, growing by a page when the sentinel nears the viewport. */
export function usePaging(total: number, reset: unknown): { count: number; sentinel: ReactNode } {
  const [count, setCount] = useState(BLOCK_PAGE_SIZE);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setCount(BLOCK_PAGE_SIZE), [reset]);
  useEffect(() => {
    const el = ref.current;
    if (!el || count >= total || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setCount((c) => Math.min(c + BLOCK_PAGE_SIZE, total));
    }, { rootMargin: "240px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [count, total]);
  return { count, sentinel: count < total ? <div ref={ref} data-block-sentinel="" className="h-8" /> : null };
}

export function useQuickLook(blocks: readonly BlockItem[]) {
  const run = useRunCommand();
  const { quickLook } = useEditorState((s) => addPanelOf(s), (a, b) => a.quickLook === b.quickLook);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [hovering, setHovering] = useState(false);
  const [used, setUsed] = useState(() => readJSON<boolean>(HINT_KEY, false));
  const open = blocks.find((b) => b.slug === quickLook) ?? null;
  useEffect(() => {
    if (open && !used) {
      writeJSON(HINT_KEY, true);
      setUsed(true);
    }
  }, [open, used]);
  useEffect(() => () => void run("insert.set", { hovered: null, quickLook: null }), [run]);
  return {
    open,
    onHover(block: BlockItem, rect: DOMRect) {
      setHovering(true);
      setOrigin(rect);
      run("insert.set", quickLook ? { hovered: block.slug, quickLook: block.slug } : { hovered: block.slug });
    },
    onLeave() {
      setHovering(false);
      run("insert.set", { hovered: null });
    },
    close: () => run("insert.set", { quickLook: null }),
    overlay: open ? <QuickLook key={open.slug} block={open} origin={origin} onClose={() => run("insert.set", { quickLook: null })} /> : null,
    hint:
      !used && !open ? (
        <div data-quick-look-hint="" className={`pointer-events-none absolute inset-x-0 bottom-14 z-50 flex justify-center transition-opacity duration-300 ${hovering ? "opacity-100" : "opacity-0"}`}>
          <div className="bg-base-300 text-base-content rounded-md px-2.5 py-1 text-[11px] whitespace-nowrap shadow-lg">
            <kbd className="bg-base-100 mr-1 rounded px-1 py-0.5 font-mono text-[10px]">Space</kbd>
            to preview
          </div>
        </div>
      ) : null,
  };
}

/** Paged, single-column cards with the Quick Look wired. */
export function BlockCards({ blocks, quick }: { blocks: readonly BlockItem[]; quick: ReturnType<typeof useQuickLook> }) {
  const { count, sentinel } = usePaging(blocks.length, blocks);
  return (
    <div className="grid w-full grid-cols-1 gap-3 p-3 pt-1" onMouseLeave={quick.onLeave}>
      {blocks.slice(0, count).map((b) => (
        <BlockCard key={b.slug} block={b} quickLookOpen={quick.open?.slug === b.slug} onHover={quick.onHover} onPress={() => quick.open && quick.close()} />
      ))}
      {sentinel}
    </div>
  );
}
