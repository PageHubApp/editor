/**
 * Session state of the media manager: filters, sort, view, folder tab, selection, and the keys
 * of the grid. Pure data in, callbacks out; the library itself is the caller's.
 */
import { useCallback, useMemo, useState } from "react";
import { readJSON, writeJSON } from "../../primitives/storage";
import { filterMedia, sortMedia, type FolderFilter, type SortDirection, type SortField, type ViewMode } from "./mediaHelpers";
import { EMPTY_SELECTION, move, select, selectAll, selectOne, type Modifiers, type Selection } from "./mediaSelection";
import type { MediaItem, MediaKind } from "@pagehub/engine/host";

const PREFS = "media-manager-prefs";
interface Prefs {
  view: ViewMode;
  sort: { field: SortField; dir: SortDirection };
}

export function useMediaBrowser(items: readonly MediaItem[], pickMode: boolean, initialKind: MediaKind | "all" = "all") {
  const [prefs, setPrefs] = useState<Prefs>(() => readJSON<Prefs>(PREFS, { view: "cards", sort: { field: "createdAt", dir: "desc" } }));
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">(initialKind);
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);

  const visible = useMemo(() => sortMedia(filterMedia(items, { search, kind, folder }), prefs.sort.field, prefs.sort.dir), [items, search, kind, folder, prefs.sort]);
  const ids = useMemo(() => visible.map((i) => i.id), [visible]);
  const savePrefs = (next: Prefs) => (setPrefs(next), writeJSON(PREFS, next));

  return {
    visible,
    search,
    setSearch,
    kind,
    setKind,
    folder,
    setFolder: (f: FolderFilter) => (setFolder(f), setSel(EMPTY_SELECTION)),
    view: prefs.view,
    setView: (view: ViewMode) => savePrefs({ ...prefs, view }),
    sort: prefs.sort,
    setSort: (sort: Prefs["sort"]) => savePrefs({ ...prefs, sort }),
    sel,
    clear: useCallback(() => setSel(EMPTY_SELECTION), []),
    pick: (id: string) => setSel(selectOne(id)),
    choose: (id: string, m?: Modifiers) => setSel((s) => select(s, ids, id, m, pickMode)),
    all: () => setSel(selectAll(ids, pickMode)),
    /** An arrow key; returns whether it was handled. */
    arrow: (key: string) => {
      const next = move(sel, ids, key, prefs.view);
      if (next) setSel(next);
      return !!next;
    },
  };
}
