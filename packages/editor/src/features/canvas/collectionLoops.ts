/**
 * Which collection a `{% for %}` lists, for the canvas chrome that adds entries to it (the empty-list placeholder,
 * the "Add entry" chip). The loop's data source is read with the inspector's own model (`readDataSource`), so a
 * filtered list (`{% assign rows = collections.plants | where … %}{% for p in rows %}`) still names `plants`.
 */
import type { NodeHandle } from "@pagehub/engine";
import { parseEditSrc, type SourceHost } from "@pagehub/engine/canvas";
import type { CollectionInfo } from "@pagehub/engine/host";
import { readDataSource } from "../inspector/dataSourceModel";
import { collectionFor } from "./hostCollections";

const isLoop = (h: NodeHandle) => h.kind === "liquid-block" && h.tag === "for";

/** The `{% for %}` a marker value (`<file>#<offset>`) names; null when it is gone. */
export function loopAt(store: SourceHost & { handle(path: string, offset: number): NodeHandle | null }, value: string | null | undefined): NodeHandle | null {
  const at = parseEditSrc(value);
  if (!at || !store.state.files.has(at.path)) return null;
  try {
    for (let h = store.handle(at.path, at.offset); h; h = h.parent()) if (isLoop(h) && h.range.from === at.offset) return h;
  } catch {
    // a file that doesn't parse has no loops to name
  }
  return null;
}

/** The slug of the `collections.<slug>` a loop lists, or null (a list of something else). */
export function loopCollectionSlug(loop: NodeHandle | null): string | null {
  if (!loop?.alive) return null;
  const base = readDataSource(loop)?.base ?? "";
  return /^collections\.([\w-]+)$/.exec(base.trim())?.[1] ?? null;
}

/** The host's collection for a slug, else (a copy in a partial) the one whose name the entry label gives. */
export function hostCollection(list: readonly CollectionInfo[], slug: string | null, entryCollection?: string | null): CollectionInfo | null {
  return (slug && collectionFor(list, slug)) || (entryCollection ? (list.find((c) => c.name === entryCollection) ?? null) : null);
}
