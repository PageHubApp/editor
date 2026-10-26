/**
 * The media manager's toolbar: search, cards / list, sort field + direction, kind filter, Upload
 * and "Use URLs", folder actions, the selection actions (move, preview, edit, delete, clear)
 * and the item count. Everything it changes goes out through callbacks.
 */
import { useRef, useState, type ReactNode } from "react";
import { tooltip } from "../../primitives/tooltip";
import { MEDIA_KIND_LABELS, type SortDirection, type SortField, type ViewMode } from "./mediaHelpers";
import { MediaIcon, type MediaIconName } from "./mediaIcons";
import type { MediaFolder, MediaKind } from "@pagehub/engine/host";

const BAR = "tool-bg-flat flex h-8 shrink-0 items-stretch gap-0.5 overflow-hidden rounded-md border border-base-300 text-neutral-content";
const FIELD = "bg-transparent px-2 text-xs text-base-content outline-none";

function Btn({ icon, label, onClick, active, disabled, danger }: { icon: MediaIconName; label: string; onClick(): void; active?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} {...tooltip(label, "bottom")} className={`tool-button flex items-center px-2 disabled:opacity-40 ${active ? "bg-base-200 text-base-content" : ""} ${danger ? "text-error" : ""}`}>
      <MediaIcon name={icon} />
    </button>
  );
}

interface MediaToolbarProps {
  search: string;
  onSearch(q: string): void;
  view: ViewMode;
  onView(v: ViewMode): void;
  sort: { field: SortField; dir: SortDirection };
  onSort(s: { field: SortField; dir: SortDirection }): void;
  kind: MediaKind | "all";
  onKind(k: MediaKind | "all"): void;
  kindCounts: Record<MediaKind, number>;
  total: number;
  shown: number;
  pickMode: boolean;
  readOnly?: boolean;
  busy?: boolean;
  onUpload(files: File[]): void;
  onAddUrl(url: string): void;
  onSelectAll(): void;
  folder: { current: string; list: readonly MediaFolder[]; custom: boolean };
  onNewFolder(): void;
  onRenameFolder(): void;
  onDeleteFolder(): void;
  selected: { count: number; single: string | null };
  onMove(folder: string | null): void;
  onPreview(): void;
  onEdit(): void;
  /** True when the single selected item is a raster image that can be cropped. */
  canCrop?: boolean;
  onCrop(): void;
  onDelete(): void;
  onClear(): void;
  children?: ReactNode;
}

export function MediaToolbar(p: MediaToolbarProps) {
  const file = useRef<HTMLInputElement>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState("");
  const edit = !p.pickMode && !p.readOnly;
  const count = p.pickMode ? (p.selected.count ? "1 selected" : `${p.shown} items`) : p.selected.count ? `${p.selected.count} selected` : p.shown === p.total ? `${p.total} items` : `${p.shown} of ${p.total}`;
  return (
    <div className="border-base-300 bg-neutral border-b px-3 py-1">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
        <div className={`${BAR} min-w-32 flex-1 items-center px-2`}>
          <MediaIcon name="search" className="size-3.5 shrink-0" />
          <input type="search" value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder="Search media..." aria-label="Search media" className={`${FIELD} min-w-0 flex-1`} />
        </div>
        <div className={BAR}>
          <Btn icon="grid" label="Cards" active={p.view === "cards"} onClick={() => p.onView("cards")} />
          <Btn icon="list" label="List" active={p.view === "list"} onClick={() => p.onView("list")} />
        </div>
        <div className={BAR}>
          <select value={p.sort.field} onChange={(e) => p.onSort({ ...p.sort, field: e.target.value as SortField })} aria-label="Sort by" className={FIELD}>
            <option value="createdAt">Date</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <Btn icon={p.sort.dir === "asc" ? "sort-asc" : "sort-desc"} label={p.sort.dir === "asc" ? "Ascending" : "Descending"} onClick={() => p.onSort({ ...p.sort, dir: p.sort.dir === "asc" ? "desc" : "asc" })} />
        </div>
        <div className={BAR}>
          <select value={p.kind} onChange={(e) => p.onKind(e.target.value as MediaKind | "all")} aria-label="Filter by media type" className={`${FIELD} w-28`}>
            <option value="all">All types ({p.total})</option>
            {(Object.keys(MEDIA_KIND_LABELS) as MediaKind[]).map((k) => (
              <option key={k} value={k}>{`${MEDIA_KIND_LABELS[k]} (${p.kindCounts[k]})`}</option>
            ))}
          </select>
        </div>
        {!p.readOnly && (
          <div className={BAR}>
            <Btn icon="upload" label="Upload files" disabled={p.busy} onClick={() => file.current?.click()} />
            <Btn icon="link" label="Use URLs" active={urlMode} onClick={() => setUrlMode((m) => !m)} />
          </div>
        )}
        {edit && (
          <div className={BAR}>
            <Btn icon="select-all" label="Select all visible" disabled={!p.shown} onClick={p.onSelectAll} />
            <Btn icon="folder-plus" label="New folder" disabled={p.busy} onClick={p.onNewFolder} />
            {p.folder.custom && <Btn icon="pencil" label="Rename folder" disabled={p.busy} onClick={p.onRenameFolder} />}
            {p.folder.custom && <Btn icon="trash" label="Delete folder" danger disabled={p.busy} onClick={p.onDeleteFolder} />}
          </div>
        )}
        {edit && p.selected.count > 0 && (
          <div className={BAR}>
            <select value="" onChange={(e) => p.onMove(e.target.value === "unfiled" ? null : e.target.value)} aria-label="Move to folder" className={FIELD}>
              <option value="" disabled>Move to…</option>
              <option value="unfiled">Unfiled</option>
              {p.folder.list.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {p.selected.single && <Btn icon="eye" label="Preview" onClick={p.onPreview} />}
            {p.selected.single && <Btn icon="pencil" label="Edit details" onClick={p.onEdit} />}
            {p.selected.single && p.canCrop && <Btn icon="crop" label="Crop image" onClick={p.onCrop} />}
            <Btn icon="trash" label="Delete selected" danger disabled={p.busy} onClick={p.onDelete} />
            <Btn icon="x" label="Clear selection" onClick={p.onClear} />
          </div>
        )}
        {/* fixed width: the digits change as the library loads, and a re-wrapping toolbar would push the grid down */}
        <span className="text-neutral-content ml-auto w-[4.5rem] shrink-0 text-right text-xs tabular-nums">{count}</span>
      </div>
      {urlMode && !p.readOnly && (
        <form
          className="mt-1 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) (p.onAddUrl(url.trim()), setUrl(""));
          }}
        >
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/photo.jpg" aria-label="Image URL" className={`${BAR} flex-1 px-2 text-xs text-base-content`} />
          <button type="submit" className="btn btn-primary btn-xs" disabled={!url.trim() || p.busy}>Add URL</button>
        </form>
      )}
      <input ref={file} type="file" multiple hidden aria-label="Upload files" onChange={(e) => (p.onUpload([...(e.target.files ?? [])]), (e.target.value = ""))} />
    </div>
  );
}
