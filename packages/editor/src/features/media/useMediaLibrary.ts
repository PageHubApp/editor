/**
 * The library behind the media manager: loads a host `MediaStore` once, runs its mutations, and
 * reloads. Filtering and sorting stay client-side (`mediaHelpers`), so the store only needs
 * `list()`, `folders()` and the writes. The editor never reaches a CDN: `upload` is the host's.
 */
import { useCallback, useEffect, useState } from "react";
import type { MediaFolder, MediaItem, MediaStore } from "@pagehub/engine/host";

interface MediaLibrary {
  items: readonly MediaItem[];
  folders: readonly MediaFolder[];
  loading: boolean;
  /** Uploads in flight (file names), for the progress strip. */
  uploading: readonly string[];
  error: string | null;
  /** Load the library again (the Retry after a failed load). */
  reload(): void;
  upload(files: readonly File[], folder: string | null): Promise<MediaItem[]>;
  addFromUrl(url: string, folder: string | null): Promise<MediaItem | null>;
  update(id: string, patch: Partial<Pick<MediaItem, "name" | "alt" | "folder">>): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  move(ids: readonly string[], folder: string | null): Promise<void>;
  createFolder(name: string, parent: string | null): Promise<MediaFolder>;
  renameFolder(id: string, name: string): Promise<void>;
  removeFolder(id: string): Promise<void>;
}

export function useMediaLibrary(store: MediaStore | null): MediaLibrary {
  const [items, setItems] = useState<readonly MediaItem[]>([]);
  const [folders, setFolders] = useState<readonly MediaFolder[]>([]);
  const [loading, setLoading] = useState(!!store);
  const [uploading, setUploading] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!store) return;
    try {
      const [i, f] = await Promise.all([store.list(), store.folders()]);
      setItems(i);
      setFolders(f);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [store]);
  useEffect(() => void reload(), [reload]);

  const guarded = async <T,>(fn: () => T | Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      await reload();
    }
  };
  const need = () => {
    if (!store) throw new Error("No media store is configured.");
    return store;
  };

  return {
    items,
    folders,
    loading,
    uploading,
    error,
    reload: () => {
      setError(null);
      setLoading(true);
      void reload();
    },
    async upload(files, folder) {
      const done: MediaItem[] = [];
      for (const file of files) {
        setUploading((u) => [...u, file.name]);
        try {
          done.push(await guarded(() => need().upload({ file, name: file.name, folder })));
        } catch {
          // the error is shown; the rest still upload
        } finally {
          setUploading((u) => u.filter((n) => n !== file.name));
        }
      }
      return done;
    },
    addFromUrl: (url, folder) => guarded(() => need().addFromUrl?.(url, folder) ?? null).catch(() => null),
    update: async (id, patch) => void (await guarded(() => need().update(id, patch))),
    remove: (ids) => guarded(() => need().remove(ids)),
    move: async (ids, folder) => void (await guarded(() => Promise.all(ids.map((id) => need().update(id, { folder }))))),
    createFolder: (name, parent) => guarded(() => need().createFolder(name, parent)),
    renameFolder: (id, name) => guarded(() => need().renameFolder(id, name)),
    removeFolder: (id) => guarded(() => need().removeFolder(id)),
  };
}
