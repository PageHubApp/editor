/**
 * The presentational media manager window; the library data lives in connectors/media/MediaManager.tsx.
 *
 * Folder tabs (All / Unfiled / each folder, with counts), the toolbar,
 * the grid, preview and edit dialogs. A floating panel 1080 wide, docked right.
 *
 * Keys are keymap commands (`mediaKeys.ts`, this window's side in `useMediaKeys`), never a
 * listener of their own: Esc clears the selection; Enter picks (pick mode) or previews; ←/→ ±1,
 * ↑/↓ ±5 in cards (±1 in a list), ←/→ step the open preview; ⌘/Ctrl+A selects all visible;
 * Backspace/Delete deletes the selection after a confirm. ⌘V pastes image files as uploads.
 * In pick mode: double-click picks and closes, and a "Select" button picks the selected item.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FloatingPanel } from "../../primitives/FloatingPanel";
import { Modal } from "../../primitives/Modal";
import { useConfirm } from "../../primitives/ConfirmDialog";
import { MediaEdit, MediaPreview } from "./MediaDialogs";
import { ImageCropModal } from "./crop/ImageCropModal";
import { canCrop as canCropItem } from "./crop/cropSave";
import { MediaGrid } from "./MediaGrid";
import { MediaToolbar } from "./MediaToolbar";
import { kindCounts } from "./mediaHelpers";
import { useMediaBrowser } from "./useMediaBrowser";
import { useMediaKeys } from "./useMediaKeys";
import type { MediaFolder, MediaItem, MediaKind } from "@pagehub/engine/host";

/** Another place to pick from besides the library (site logo, a Liquid expression). */
export interface MediaSource {
  id: string;
  label: string;
  render(pick: (value: string) => void): ReactNode;
}

interface MediaActions {
  upload(files: File[], folder: string | null): Promise<unknown>;
  addFromUrl(url: string, folder: string | null): Promise<unknown>;
  update(id: string, patch: Partial<Pick<MediaItem, "name" | "alt" | "folder">>): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  move(ids: readonly string[], folder: string | null): Promise<void>;
  createFolder(name: string, parent: string | null): Promise<unknown>;
  renameFolder(id: string, name: string): Promise<void>;
  removeFolder(id: string): Promise<void>;
}

interface MediaManagerViewProps {
  open: boolean;
  onClose(): void;
  /** Present: pick mode ("Select Media"); the manager closes after a pick. */
  onPick?(mediaId: string): void;
  kindFilter?: MediaKind;
  sources?: readonly MediaSource[];
  /** Skip the floating-panel frame; the body fills its host (the right drawer provides title + close). */
  chromeless?: boolean;
  items: readonly MediaItem[];
  folders: readonly MediaFolder[];
  loading?: boolean;
  uploading: readonly string[];
  error?: string | null;
  /** Retry a failed library load. */
  onRetry?(): void;
  /** No store: the manager says so instead of a grid. */
  unavailable?: boolean;
  actions: MediaActions;
}

const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function MediaManagerView(p: MediaManagerViewProps) {
  const pickMode = !!p.onPick;
  const b = useMediaBrowser(p.items, pickMode, p.kindFilter ?? "all");
  const { ask, dialog } = useConfirm();
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<{ id: string | null; name: string } | null>(null);
  const [tab, setTab] = useState<string>("library");
  const root = useRef<HTMLDivElement>(null);
  const folderId = b.folder === "all" || b.folder === "unfiled" ? null : b.folder;
  const find = (id: string | null) => p.items.find((i) => i.id === id) ?? null;

  const choose = (id: string) => {
    p.onPick?.(id);
    p.onClose();
  };
  const upload = (files: File[]) => files.length && void p.actions.upload(files, folderId);
  const remove = async () => {
    const n = b.sel.ids.length;
    if (!n || pickMode) return;
    if (!(await ask({ title: `Delete ${n === 1 ? "this file" : `${n} files`}?`, message: "Deleted media can't be restored. Pages that use it will show a broken image.", confirmText: "Delete", variant: "danger" }))) return;
    await p.actions.remove(b.sel.ids);
    b.clear();
  };

  useEffect(() => {
    if (!p.open || p.actions === undefined) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isField(e.target) || pickMode) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) (e.preventDefault(), upload(files));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  useMediaKeys({ open: p.open, root, pickMode, browser: b, preview, setPreview, dialog: !!editing || !!folderName || !!cropping, remove: () => void remove(), choose });

  const counts = useMemo(() => kindCounts(p.items), [p.items]);
  const folderNames = useMemo(() => new Map(p.folders.map((f) => [f.id, f.name])), [p.folders]);
  const tabs = [
    { id: "all", label: `All (${p.items.length})` },
    { id: "unfiled", label: `Unfiled (${p.items.filter((i) => i.folder === null).length})` },
    ...p.folders.map((f) => ({ id: f.id, label: `${f.name} (${p.items.filter((i) => i.folder === f.id).length})` })),
  ];
  const sources = p.sources ?? [];
  const h = typeof window === "undefined" ? 800 : window.innerHeight;

  const body = (
      <div data-slot="MediaManager" className="contents">
        <div ref={root} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
          {sources.length > 0 && (
            <div role="tablist" className="border-base-300 flex items-center gap-1 border-b p-2">
              {[{ id: "library", label: "Library" }, ...sources].map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} onClick={() => setTab(s.id)} className={`btn btn-xs ${tab === s.id ? "btn-primary" : "btn-ghost"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {tab !== "library" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">{sources.find((s) => s.id === tab)?.render((v) => (p.onPick?.(v), p.onClose()))}</div>
          ) : p.unavailable ? (
            <p className="text-neutral-content p-8 text-center text-sm">No media library is connected. Ask your host to provide one.</p>
          ) : (
            <>
              <div role="tablist" aria-label="Folders" className="border-base-300 flex shrink-0 gap-3 overflow-x-auto border-b px-3">
                {tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={b.folder === t.id} onClick={() => b.setFolder(t.id)} className={`relative shrink-0 cursor-pointer py-2 text-xs font-medium ${b.folder === t.id ? "text-base-content after:bg-base-content after:absolute after:inset-x-0 after:-bottom-px after:h-px after:content-['']" : "text-neutral-content hover:text-base-content"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <MediaToolbar
                search={b.search}
                onSearch={b.setSearch}
                view={b.view}
                onView={b.setView}
                sort={b.sort}
                onSort={b.setSort}
                kind={b.kind}
                onKind={b.setKind}
                kindCounts={counts}
                total={p.items.length}
                shown={b.visible.length}
                pickMode={pickMode}
                busy={p.uploading.length > 0}
                onUpload={upload}
                onAddUrl={(u) => void p.actions.addFromUrl(u, folderId)}
                onSelectAll={b.all}
                folder={{ current: b.folder, list: p.folders, custom: folderId !== null }}
                onNewFolder={() => setFolderName({ id: null, name: "" })}
                onRenameFolder={() => setFolderName({ id: folderId, name: folderNames.get(folderId!) ?? "" })}
                onDeleteFolder={async () => {
                  if (folderId && (await ask({ title: "Delete this folder?", message: "Its files stay in the library, unfiled.", confirmText: "Delete folder", variant: "danger" }))) {
                    await p.actions.removeFolder(folderId);
                    b.setFolder("all");
                  }
                }}
                selected={{ count: b.sel.ids.length, single: b.sel.ids.length === 1 ? b.sel.ids[0]! : null }}
                onMove={(f) => void p.actions.move(b.sel.ids, f)}
                onPreview={() => setPreview(b.sel.primary)}
                onEdit={() => setEditing(b.sel.primary)}
                canCrop={canCropItem(find(b.sel.primary))}
                onCrop={() => setCropping(b.sel.primary)}
                onDelete={() => void remove()}
                onClear={b.clear}
              />
              <div className="min-h-0 flex-1">
                <MediaGrid items={b.visible} total={p.items.length} view={b.view} selectedIds={b.sel.ids} pickMode={pickMode} loading={p.loading} error={p.error} onRetry={p.onRetry} uploading={p.uploading} folderNames={folderNames} onSelect={b.choose} onOpen={(id) => pickMode && choose(id)} onPreview={setPreview} onDropFiles={upload} onPick={() => b.sel.primary && choose(b.sel.primary)} />
              </div>
            </>
          )}
        </div>
        <MediaPreview item={find(preview)} onClose={() => setPreview(null)} />
        <MediaEdit item={find(editing)} folders={p.folders} onSave={(patch) => void p.actions.update(editing!, patch)} onClose={() => setEditing(null)} />
        <ImageCropModal
          item={find(cropping)}
          onClose={() => setCropping(null)}
          onSave={(file) => void p.actions.upload([file], find(cropping)?.folder ?? folderId)}
        />
        <Modal isOpen={!!folderName} onClose={() => setFolderName(null)} title={folderName?.id ? "Rename folder" : "New folder"} size="sm" zIndex={1250}>
          {folderName && (
            <form
              className="flex flex-col gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const name = folderName.name.trim();
                if (!name) return;
                void (folderName.id ? p.actions.renameFolder(folderName.id, name) : p.actions.createFolder(name, null));
                setFolderName(null);
              }}
            >
              <input autoFocus value={folderName.name} onChange={(e) => setFolderName({ ...folderName, name: e.target.value })} placeholder="Folder name" aria-label="Folder name" className="border-base-300 bg-base-200 text-base-content h-8 rounded-md border px-2 text-xs" />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFolderName(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!folderName.name.trim()}>Save</button>
              </div>
            </form>
          )}
        </Modal>
        {dialog}
      </div>
  );

  // Chromeless (the right drawer frames it): render the body only. Otherwise the floating panel —
  // the picker ("Select Media") and any standalone use of the view still get their own window.
  if (p.chromeless) return p.open ? body : null;
  return (
    <FloatingPanel isOpen={p.open} onClose={p.onClose} title={pickMode ? "Select Media" : "Media Manager"} storageKey="media-manager-v3" autoSize={false} defaultWidth={1080} defaultHeight={Math.max(560, Math.min(760, Math.round(h * 0.78)))} minWidth={760} maxWidth={1400} minHeight={500} dockToEdge="right" zIndex={1200}>
      {body}
    </FloatingPanel>
  );
}
