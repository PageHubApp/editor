/**
 * The media store: the library the media manager browses, supplied by the host. The editor
 * never talks to a CDN; `upload` is the host's. `memoryMediaStore` is the in-memory
 * implementation for tests and demos.
 *
 *   const store = memoryMediaStore();
 *   configure({ extensions: [mediaFacet.of(store)] });
 */
import { defineFacet } from "../extensions/extension";

export type MediaKind = "image" | "video" | "audio" | "pdf" | "archive" | "other";

export interface MediaItem {
  /** The id written into the source (`{{ 'id' | image_url }}`). */
  id: string;
  name: string;
  contentType: string;
  /** Bytes. */
  size: number;
  /** Folder id; `null` is the root. */
  folder: string | null;
  /** Where the browser can show it (thumbnail / preview). */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  /** ms since the epoch. */
  createdAt: number;
}

export interface MediaFolder {
  id: string;
  name: string;
  parent: string | null;
}

export interface MediaQuery {
  /** Folder id; omit for everything. */
  folder?: string | null;
  search?: string;
  kind?: MediaKind;
}

export interface UploadInput {
  file: File | Blob;
  name: string;
  folder: string | null;
}

/** What the host implements. Every method may be async. */
export interface MediaStore {
  list(query?: MediaQuery): MediaItem[] | Promise<MediaItem[]>;
  folders(): MediaFolder[] | Promise<MediaFolder[]>;
  upload(input: UploadInput): MediaItem | Promise<MediaItem>;
  /** Fetch a remote image into the library (the "URL" add mode). */
  addFromUrl?(url: string, folder: string | null): MediaItem | Promise<MediaItem>;
  update(id: string, patch: Partial<Pick<MediaItem, "name" | "alt" | "folder">>): MediaItem | Promise<MediaItem>;
  remove(ids: readonly string[]): void | Promise<void>;
  createFolder(name: string, parent: string | null): MediaFolder | Promise<MediaFolder>;
  renameFolder(id: string, name: string): void | Promise<void>;
  removeFolder(id: string): void | Promise<void>;
}

/** The configured store, or `null` (the media manager then says so). */
export const mediaFacet = defineFacet<MediaStore, MediaStore | null>({ id: "media", combine: (values) => values[0] ?? null });

export function mediaKind(contentType: string): MediaKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "pdf";
  if (/zip|tar|gzip|rar/.test(contentType)) return "archive";
  return "other";
}

export function memoryMediaStore(seed: { items?: readonly MediaItem[]; folders?: readonly MediaFolder[] } = {}): MediaStore & { readonly items: readonly MediaItem[] } {
  let items = [...(seed.items ?? [])];
  let folders = [...(seed.folders ?? [])];
  let n = 0;
  const taken = (id: string) => items.some((i) => i.id === id) || folders.some((f) => f.id === id);
  const nextId = (p: string) => {
    while (taken(`${p}${++n}`));
    return `${p}${n}`;
  };
  const must = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) throw new Error(`no media "${id}"`);
    return it;
  };
  return {
    get items() {
      return items;
    },
    list: ({ folder, search, kind } = {}) => {
      const q = search?.trim().toLowerCase();
      return items.filter((i) => (folder === undefined || i.folder === folder) && (!kind || mediaKind(i.contentType) === kind) && (!q || i.name.toLowerCase().includes(q)));
    },
    folders: () => folders,
    upload: ({ file, name, folder }) => {
      const item: MediaItem = { id: nextId("m"), name, contentType: file.type || "application/octet-stream", size: file.size, folder, url: `memory://${name}`, createdAt: Date.now() };
      items = [...items, item];
      return item;
    },
    addFromUrl: (url, folder) => {
      const item: MediaItem = { id: nextId("m"), name: url.split("/").pop() || url, contentType: "image/*", size: 0, folder, url, createdAt: Date.now() };
      items = [...items, item];
      return item;
    },
    update: (id, patch) => {
      const next = { ...must(id), ...patch };
      items = items.map((i) => (i.id === id ? next : i));
      return next;
    },
    remove: (ids) => void (items = items.filter((i) => !ids.includes(i.id))),
    createFolder: (name, parent) => {
      const f = { id: nextId("f"), name, parent };
      folders = [...folders, f];
      return f;
    },
    renameFolder: (id, name) => void (folders = folders.map((f) => (f.id === id ? { ...f, name } : f))),
    removeFolder: (id) => {
      folders = folders.filter((f) => f.id !== id);
      items = items.map((i) => (i.folder === id ? { ...i, folder: null } : i));
    },
  };
}
