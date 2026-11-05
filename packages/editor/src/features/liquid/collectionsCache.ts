/**
 * The host's collections (`collectionRowsFacet.collections()`) read synchronously, for code that
 * isn't a React component (the rich-text session builds its `{{` list and chip labels on demand).
 * The first read starts the load and returns null; `onLoad` runs once the list arrives. A new
 * canvas data version (`canvas.reloadData`) reloads it. React surfaces use `useHostCollections`.
 *
 *   const list = peekCollections(rows, canvasOf(state).dataVersion, () => redraw());
 */
import type { CollectionInfo, CollectionRows } from "@pagehub/engine/host";

interface Entry {
  version: number;
  list: readonly CollectionInfo[] | null;
  waiters: Set<() => void>;
}

const cache = new WeakMap<CollectionRows, Entry>();

export function peekCollections(rows: CollectionRows | null, version: number, onLoad?: () => void): readonly CollectionInfo[] | null {
  if (!rows?.collections) return null;
  const hit = cache.get(rows);
  if (hit && hit.version === version) {
    if (!hit.list && onLoad) hit.waiters.add(onLoad);
    return hit.list;
  }
  const entry: Entry = { version, list: null, waiters: new Set(onLoad ? [onLoad] : []) };
  cache.set(rows, entry);
  const settle = (list: readonly CollectionInfo[]) => {
    if (cache.get(rows) !== entry) return;
    entry.list = list;
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    for (const w of waiters) w();
  };
  let result: readonly CollectionInfo[] | Promise<readonly CollectionInfo[]>;
  try {
    result = rows.collections();
  } catch {
    result = [];
  }
  if (Array.isArray(result)) {
    entry.list = result as readonly CollectionInfo[];
    entry.waiters.clear();
    return entry.list;
  }
  Promise.resolve(result).then(settle, () => settle([]));
  return null;
}
