/**
 * The site's collections as the host lists them (`collectionRowsFacet.collections`), for every collection-aware
 * surface: the source picker, the Add panel's collection list, field pickers, the empty-list placeholder and the
 * detail-page preview switcher. Re-read when the canvas data reloads (`canvas.reloadData`, e.g. after a new entry
 * or collection is saved in the host's form). Null: no host, or a host that doesn't list collections.
 */
import { useEffect, useState } from "react";
import { collectionRowsFacet, type CollectionInfo, type CollectionRows } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { canvasOf } from "./canvasState";

export interface HostCollections {
  rows: CollectionRows;
  /** The site's collections; `[]` while loading or when it has none. */
  list: readonly CollectionInfo[];
  /** True once the host answered. */
  loaded: boolean;
}

/** The collection a `collections.<slug>` expression (or bare slug) names, if the host lists it. */
export function collectionFor(list: readonly CollectionInfo[], expression: string): CollectionInfo | null {
  const slug = /^\s*(?:collections\.)?([\w-]+)\s*$/.exec(expression)?.[1];
  return (slug && list.find((c) => c.slug === slug)) || null;
}

export function useHostCollections(): HostCollections | null {
  const rows = useEditorState((s) => s.facet(collectionRowsFacet));
  const version = useEditorState((s) => canvasOf(s).dataVersion);
  const [state, setState] = useState<{ for: CollectionRows | null; list: readonly CollectionInfo[]; loaded: boolean }>({ for: null, list: [], loaded: false });
  useEffect(() => {
    if (!rows?.collections) return;
    let live = true;
    Promise.resolve()
      .then(() => rows.collections!())
      .then(
        (list) => live && setState({ for: rows, list, loaded: true }),
        () => live && setState({ for: rows, list: [], loaded: true }),
      );
    return () => void (live = false);
  }, [rows, version]);
  if (!rows?.collections) return null;
  return state.for === rows ? { rows, list: state.list, loaded: state.loaded } : { rows, list: [], loaded: false };
}
