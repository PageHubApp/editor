/** Pure helpers of the media manager: kinds, filtering, sorting, sizes. */
import { mediaKind, type MediaItem, type MediaKind } from "@pagehub/engine/host";

export type SortField = "name" | "size" | "createdAt";
export type SortDirection = "asc" | "desc";
export type ViewMode = "cards" | "list";
/** `all`, `unfiled` (root) or a folder id. */
export type FolderFilter = string;

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = { image: "Image", video: "Video", audio: "Audio", pdf: "PDF", archive: "Archive", other: "Other" };

export function formatFileSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

interface MediaFilters {
  search: string;
  kind: MediaKind | "all";
  folder: FolderFilter;
}

export function filterMedia(items: readonly MediaItem[], f: MediaFilters): MediaItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => (f.folder === "all" || (f.folder === "unfiled" ? i.folder === null : i.folder === f.folder)) && (f.kind === "all" || mediaKind(i.contentType) === f.kind) && (!q || i.name.toLowerCase().includes(q)));
}

export function sortMedia(items: readonly MediaItem[], field: SortField, dir: SortDirection): MediaItem[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => sign * (field === "name" ? a.name.localeCompare(b.name) : a[field] - b[field]));
}

export function kindCounts(items: readonly MediaItem[]): Record<MediaKind, number> {
  const out: Record<MediaKind, number> = { image: 0, video: 0, audio: 0, pdf: 0, archive: 0, other: 0 };
  for (const i of items) out[mediaKind(i.contentType)]++;
  return out;
}

