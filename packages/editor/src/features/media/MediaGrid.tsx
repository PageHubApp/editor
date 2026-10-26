/**
 * The media grid: cards (auto-fill 11.5rem) or a list table; a selection ring / tint; a corner
 * checkbox (outside pick mode); an eye button to preview; a drop overlay; the upload strip; the
 * empty states; and the floating "Select" button in pick mode.
 */
import { useState } from "react";
import { InlineError } from "../../primitives/InlineError";
import { Skeleton, SkeletonRegion } from "../../primitives/Skeleton";
import { MediaIcon } from "./mediaIcons";
import { formatFileSize, MEDIA_KIND_LABELS, type ViewMode } from "./mediaHelpers";
import type { Modifiers } from "./mediaSelection";
import { mediaKind, type MediaItem } from "@pagehub/engine/host";

const LIST_COLS = "grid-cols-[1.5rem_3rem_minmax(0,1fr)_5rem_6rem_7rem]";

function Thumb({ item, className }: { item: MediaItem; className: string }) {
  const kind = mediaKind(item.contentType);
  return kind === "image" ? (
    <img src={item.url} alt={item.alt ?? ""} loading="lazy" className={`${className} object-cover`} />
  ) : (
    <div className={`${className} bg-neutral text-neutral-content flex flex-col items-center justify-center gap-1 text-[10px]`}>
      <MediaIcon name="file" className="size-6" />
      {MEDIA_KIND_LABELS[kind]}
    </div>
  );
}

interface ItemProps {
  item: MediaItem;
  view: ViewMode;
  selected: boolean;
  pickMode: boolean;
  folderName: string;
  onSelect(m?: Modifiers): void;
  onOpen(): void;
  onPreview(): void;
}

function Item({ item, view, selected, pickMode, folderName, onSelect, onOpen, onPreview }: ItemProps) {
  const check = !pickMode && (
    <input type="checkbox" checked={selected} readOnly aria-label="Select media item" onClick={(e) => (e.stopPropagation(), onSelect({ shiftKey: e.shiftKey, metaKey: true }))} className="checkbox checkbox-sm border-base-300 bg-base-100/95" />
  );
  const base = view === "cards" ? `border-base-300 bg-base-200 overflow-hidden rounded-lg border ${selected ? "ring-primary ring-offset-background ring-2 ring-offset-2" : "hover:border-primary"}` : `border-base-300/70 grid ${LIST_COLS} items-center gap-3 border-b px-4 py-2 ${selected ? "bg-primary/10" : "hover:bg-base-200/55"}`;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-media-id={item.id}
      onClick={(e) => onSelect({ shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey })}
      onDoubleClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onSelect())}
      className={`group relative cursor-pointer ${base}`}
    >
      {view === "list" ? (
        <>
          <div className="flex items-center">{check}</div>
          <Thumb item={item} className="size-10 rounded" />
          <span className="text-base-content truncate text-sm" data-media-name="">{item.name}</span>
          <span className="text-neutral-content text-xs">{MEDIA_KIND_LABELS[mediaKind(item.contentType)]}</span>
          <span className="text-neutral-content text-xs">{formatFileSize(item.size)}</span>
          <span className="text-neutral-content truncate text-xs">{folderName}</span>
        </>
      ) : (
        <>
          <Thumb item={item} className="aspect-square w-full" />
          <div className="p-2">
            <div className="text-base-content truncate text-xs font-medium" data-media-name="">{item.name}</div>
            <div className="text-neutral-content text-[10px]">{`${formatFileSize(item.size)} · ${folderName}`}</div>
          </div>
          <div className="absolute top-1 left-1">{check}</div>
          <button type="button" aria-label="Preview media" onClick={(e) => (e.stopPropagation(), onPreview())} className="bg-base-100/90 text-base-content absolute top-1 right-1 rounded p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <MediaIcon name="eye" />
          </button>
        </>
      )}
    </div>
  );
}

interface MediaGridProps {
  items: readonly MediaItem[];
  /** Items in the library before filtering. */
  total: number;
  view: ViewMode;
  selectedIds: readonly string[];
  pickMode: boolean;
  readOnly?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?(): void;
  uploading: readonly string[];
  folderNames: ReadonlyMap<string, string>;
  onSelect(id: string, m?: Modifiers): void;
  onOpen(id: string): void;
  onPreview(id: string): void;
  onDropFiles(files: File[]): void;
  onPick?(): void;
}

export function MediaGrid(p: MediaGridProps) {
  const [over, setOver] = useState(false);
  const drop = !p.readOnly;
  return (
    <div
      className="scrollbar bg-base-100 relative h-full overflow-y-auto"
      role="region"
      aria-label="Media library"
      onDragOver={(e) => drop && e.dataTransfer?.types?.includes("Files") && (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!drop || !e.dataTransfer?.files?.length) return;
        e.preventDefault();
        p.onDropFiles([...e.dataTransfer.files]);
      }}
    >
      {over && (
        <div data-drop-overlay="" className="border-accent bg-base-200/75 absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed">
          <div className="text-center">
            <MediaIcon name="upload" className="mx-auto size-12" />
            <p className="text-xl font-semibold">Drop files here</p>
            <p className="text-sm opacity-75">Release to upload multiple files</p>
          </div>
        </div>
      )}
      {p.uploading.length > 0 && (
        <div role="status" className="border-base-300 bg-base-200 absolute inset-x-0 top-0 z-30 border-b p-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="border-accent size-4 animate-spin rounded-full border-2 border-t-transparent" />
            <span className="font-medium">{`Uploading ${p.uploading.length} file${p.uploading.length === 1 ? "" : "s"}…`}</span>
          </div>
          <div className="text-neutral-content mt-1 truncate text-xs">{p.uploading[0]}</div>
        </div>
      )}
      {p.error && <InlineError message={p.error} onRetry={p.onRetry} />}
      {p.loading ? (
        <SkeletonRegion label="Loading media" className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
          ))}
        </SkeletonRegion>
      ) : p.items.length === 0 && p.error ? null : p.items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <div className="bg-neutral mb-4 rounded-full p-6">
            <MediaIcon name="search" className="text-neutral-content size-12" />
          </div>
          <p className="text-base-content mb-2 text-xl font-semibold">{p.total ? "No media found" : "No media yet"}</p>
          <p className="text-neutral-content text-sm">{p.total ? "Try a different search, type or folder." : p.readOnly ? "This library is empty." : "Drop files here, or use Upload."}</p>
        </div>
      ) : (
        <div className="p-4">
          {p.view === "list" && (
            <div className={`text-base-content/60 border-base-300/70 bg-base-100/80 mb-1 grid ${LIST_COLS} items-center gap-3 rounded-md border px-4 py-2 text-[10px] font-semibold tracking-[0.08em] uppercase`}>
              <span />
              <span />
              <span>Name</span>
              <span>Type</span>
              <span>Size</span>
              <span>Folder</span>
            </div>
          )}
          <div className={p.view === "cards" ? "grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3" : "border-base-300/70 bg-base-100 overflow-hidden rounded-md border"}>
            {p.items.map((item) => (
              <Item key={item.id} item={item} view={p.view} selected={p.selectedIds.includes(item.id)} pickMode={p.pickMode} folderName={(item.folder && p.folderNames.get(item.folder)) || "Unfiled"} onSelect={(m) => p.onSelect(item.id, m)} onOpen={() => p.onOpen(item.id)} onPreview={() => p.onPreview(item.id)} />
            ))}
          </div>
        </div>
      )}
      {p.pickMode && p.selectedIds.length > 0 && p.onPick && (
        <div className="absolute right-4 bottom-4">
          <button type="button" className="btn btn-primary shadow-lg" onClick={p.onPick}>Select</button>
        </div>
      )}
    </div>
  );
}
