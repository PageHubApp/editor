/**
 * Crop one library image: a stage with a ratio picker, a live size readout, and a Save button that
 * hands the cropped `File` back for the host to upload. "Replace original" shows only when the
 * store can repoint an id in place (`canReplaceInPlace`) — this editor can't, so it's "Save as
 * copy" only.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { MediaItem } from "@pagehub/engine/host";
import { Modal } from "../../../primitives/Modal";
import { ToolbarSegmentedControl } from "../../toolbar/primitives/ToolbarSegmentedControl";
import { CROP_RATIO_PRESETS, cropSizeLabel } from "./cropMath";
import { buildCroppedFile, canReplaceInPlace } from "./cropSave";
import { useCropState } from "./useCropState";
import { CropStage } from "./CropStage";

interface ImageCropModalProps {
  /** The image being cropped; `null` keeps the dialog closed. */
  item: MediaItem | null;
  onClose: () => void;
  /** The cropped file — the caller uploads it through the host's media store. */
  onSave: (file: File) => void | Promise<void>;
  zIndex?: number;
}

const RATIO_OPTIONS = CROP_RATIO_PRESETS.map(p => ({ value: p.key, label: p.label }));

export function ImageCropModal({ item, onClose, onSave, zIndex = 1260 }: ImageCropModalProps) {
  const titleId = useId();
  // Keep the last item on screen while the exit transition plays.
  const shownRef = useRef(item);
  if (item) shownRef.current = item;
  const media = item ?? shownRef.current;

  const state = useCropState(media);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isOpen = item != null;
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSaving(false);
      return;
    }
    abortRef.current?.abort();
  }, [isOpen]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fileName = media?.name || media?.id || "";
  const showReplace = canReplaceInPlace(media);
  const canSave = !!state.pixelCrop && !state.unchanged && !saving;
  const hint = !state.natural
    ? ""
    : state.unchanged
      ? "Drag the edges of the box or pick a ratio."
      : "The crop is saved as a new copy in the same folder.";

  const save = async () => {
    if (!media || !state.pixelCrop || saving) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSaving(true);
    setError(null);
    try {
      const { file } = await buildCroppedFile({ item: media, crop: state.pixelCrop, signal: controller.signal });
      if (controller.signal.aborted) return;
      await onSave(file);
      onClose();
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(err instanceof Error ? err.message : "Couldn't save the crop. Try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy={titleId}
      zIndex={zIndex}
      surface={false}
      className="pagehub-editor border-base-300 bg-base-100 text-base-content pointer-events-auto flex h-[min(90vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-box border shadow-xl"
    >
      <header className="border-base-300 flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold">
            Crop image
          </h2>
          <p className="text-neutral-content truncate text-xs">{fileName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-content hover:bg-base-200 hover:text-base-content rounded-md p-2 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </header>

      <CropStage
        src={state.src}
        natural={state.natural}
        loadFailed={state.loadFailed}
        crop={state.crop}
        aspect={state.aspect}
        onChange={state.setCrop}
        disabled={saving}
      />

      <div className="border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3">
        <div className={state.natural && !saving ? "" : "pointer-events-none opacity-50"}>
          <ToolbarSegmentedControl
            compact
            aria-label="Aspect ratio"
            value={state.ratioKey}
            onChange={state.selectRatio}
            options={RATIO_OPTIONS}
          />
        </div>
        <p className="text-neutral-content text-xs tabular-nums" aria-live="polite">
          {state.pixelCrop ? cropSizeLabel(state.pixelCrop) : " "}
        </p>
      </div>

      <footer className="border-base-300 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p role={error ? "alert" : undefined} className={`min-h-4 text-xs ${error ? "text-error" : "text-neutral-content"}`}>
          {error ?? hint}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:shrink-0 sm:flex-row">
          {showReplace && (
            <button type="button" onClick={save} disabled={!canSave} className="btn btn-outline btn-sm">
              {saving ? "Replacing…" : "Replace original"}
            </button>
          )}
          <button type="button" onClick={save} disabled={!canSave} className="btn btn-primary btn-sm">
            {saving ? "Saving…" : "Save as copy"}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
