/**
 * A block's source and preview, for a host that lists blocks without them (`BlockSource.detail`). Each block is
 * asked for once per source; the answer (or the failure) is kept, so a card that scrolls away and back, and the
 * insert that follows, never ask again. A block that already carries its `source` needs no request.
 */
import { useEffect, useState, type RefObject } from "react";
import { useEditorState } from "../../react/bindings";
import { blockSourceFacet, type BlockDetail, type BlockItem, type BlockSource } from "@pagehub/engine/host";

interface Entry {
  promise: Promise<BlockDetail>;
  value?: BlockDetail;
  failed?: string;
}

const entries = new WeakMap<BlockSource, Map<string, Entry>>();

function entryOf(source: BlockSource, slug: string, retry = false): Entry | null {
  if (!source.detail) return null;
  let map = entries.get(source);
  if (!map) entries.set(source, (map = new Map()));
  let entry = map.get(slug);
  if (!entry || (retry && entry.failed !== undefined)) {
    const made: Entry = { promise: source.detail(slug).then((d) => (made.value = d), (e: unknown) => {
      made.failed = e instanceof Error ? e.message : String(e);
      throw e;
    }) };
    made.promise.catch(() => {}); // the failure is read from `failed`; an unobserved rejection isn't an error
    map.set(slug, (entry = made));
  }
  return entry;
}

const withDetail = (block: BlockItem, d: BlockDetail): BlockItem => ({ ...block, source: d.source, preview: d.preview });

/** `block` with its source and preview (the host's `detail` when the item has none). Rejects when the host can't. */
export async function resolveBlock(source: BlockSource | null, block: BlockItem): Promise<BlockItem> {
  if (block.source !== undefined) return block;
  const entry = source && entryOf(source, block.slug, true); // an insert asks again after a failure
  if (!entry) throw new Error("This block has no source.");
  return withDetail(block, await entry.promise);
}

export type BlockDetailStatus = "ready" | "loading" | "error";

/**
 * True from the moment `ref`'s element comes within `margin` of the viewport (and stays true: a preview that has
 * loaded isn't unloaded when it scrolls away). Where there is no IntersectionObserver everything counts as near.
 */
export function useNearViewport(ref: RefObject<Element | null>, margin = "300px 0px"): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, ref, margin]);
  return near;
}

/**
 * The block with its detail once it is known. Nothing is requested until `enabled` (a card asks when it nears the
 * viewport); a block already listed with its source is `ready` at once.
 */
export function useBlockDetail(block: BlockItem, enabled: boolean): { block: BlockItem; status: BlockDetailStatus } {
  const source = useEditorState((s) => s.facet(blockSourceFacet));
  const peek = (): { block: BlockItem; status: BlockDetailStatus } => {
    if (block.source !== undefined) return { block, status: "ready" };
    const entry = source?.detail && entries.get(source)?.get(block.slug);
    if (entry?.value) return { block: withDetail(block, entry.value), status: "ready" };
    return { block, status: entry?.failed !== undefined || !source?.detail ? "error" : "loading" };
  };
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled || block.source !== undefined || !source) return;
    const entry = entryOf(source, block.slug);
    if (!entry || entry.value || entry.failed !== undefined) return;
    let live = true;
    const done = () => live && bump((n) => n + 1);
    entry.promise.then(done, done);
    return () => void (live = false);
  }, [enabled, block, source]);
  return peek();
}
