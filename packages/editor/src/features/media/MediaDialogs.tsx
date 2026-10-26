/** Preview (image / video / audio / pdf / file) and the details form (name, alt text, folder). */
import { useState } from "react";
import { Modal } from "../../primitives/Modal";
import { formatFileSize } from "./mediaHelpers";
import { mediaKind, type MediaFolder, type MediaItem } from "@pagehub/engine/host";

const Z = 1250;

export function MediaPreview({ item, onClose }: { item: MediaItem | null; onClose(): void }) {
  const kind = item ? mediaKind(item.contentType) : "other";
  return (
    <Modal isOpen={!!item} onClose={onClose} title={item?.name ?? "Preview"} size="xl" zIndex={Z}>
      {item && (
        <div className="flex flex-col gap-2 p-4">
          <div className="bg-neutral flex max-h-[70vh] min-h-48 items-center justify-center overflow-hidden rounded-lg">
            {kind === "image" ? <img src={item.url} alt={item.alt ?? ""} className="max-h-[70vh] object-contain" /> : kind === "video" ? <video src={item.url} controls playsInline className="max-h-[70vh]" /> : kind === "audio" ? <audio src={item.url} controls /> : kind === "pdf" ? <iframe src={item.url} aria-label={item.name} className="h-[70vh] w-full" /> : <a href={item.url} download className="btn btn-primary">Download</a>}
          </div>
          <p className="text-neutral-content text-xs">{[item.contentType, formatFileSize(item.size), item.width && item.height ? `${item.width}×${item.height}` : ""].filter(Boolean).join(" · ")}</p>
        </div>
      )}
    </Modal>
  );
}

export function MediaEdit({ item, folders, onSave, onClose }: { item: MediaItem | null; folders: readonly MediaFolder[]; onSave(patch: Pick<MediaItem, "name" | "alt" | "folder">): void; onClose(): void }) {
  return (
    <Modal isOpen={!!item} onClose={onClose} title="Edit media" size="md" zIndex={Z}>
      {item && <EditForm key={item.id} item={item} folders={folders} onSave={onSave} onClose={onClose} />}
    </Modal>
  );
}

function EditForm({ item, folders, onSave, onClose }: { item: MediaItem; folders: readonly MediaFolder[]; onSave(p: Pick<MediaItem, "name" | "alt" | "folder">): void; onClose(): void }) {
  const [name, setName] = useState(item.name);
  const [alt, setAlt] = useState(item.alt ?? "");
  const [folder, setFolder] = useState(item.folder ?? "");
  const field = "border-base-300 bg-base-200 text-base-content h-8 w-full rounded-md border px-2 text-xs";
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) (onSave({ name: name.trim(), alt, folder: folder || null }), onClose());
      }}
    >
      <label className="flex flex-col gap-1 text-xs">Name<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 text-xs">Alt text<input value={alt} onChange={(e) => setAlt(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 text-xs">Folder
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className={field}>
          <option value="">Unfiled</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>Save</button>
      </div>
    </form>
  );
}
