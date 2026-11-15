/**
 * The default `SaveStatus` slot: the save icon the top bar's Save button shows, with a short
 * word beside it from `lg` up — floppy "All changes saved", amber dot "Unsaved changes" (edits waiting
 * for autosave), spinner "Saving…", green check "Saved", amber warning "Not saved · Try again" (the
 * retry is a button; read out assertively), and amber "Editing is paused" when the host froze writes.
 * The text sits in a fixed-width box so a change of state never moves the top bar.
 */
import { useEditorState, useEditorStore } from "../../react/bindings";
import { isCore } from "../../react/events";
import { tooltip } from "../../primitives/tooltip";
import { Icon, type IconName } from "../../primitives/icons";
import { saveSession, useSaveSession, type SaveStatus as Status } from "./saveSession";

/** What the status shows: the session status, or "pending" while edits wait for the next save. */
export type SaveView = Status | "pending";

export const SAVE_LABELS: Readonly<Record<Status, string>> = {
  idle: "All changes saved",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed — your changes are unsaved",
  paused: "Editing is paused — your changes are unsaved",
};

const PENDING_LABEL = "Unsaved changes";

/** The short words beside the icon. */
export const SAVE_TEXT: Readonly<Record<SaveView, string>> = {
  idle: "All saved",
  pending: PENDING_LABEL,
  saving: "Saving…",
  saved: "Saved",
  failed: "Not saved",
  paused: "Paused",
};

const ICON: Readonly<Record<SaveView, { name: IconName; className?: string }>> = {
  idle: { name: "floppy" },
  pending: { name: "floppy", className: "text-warning" },
  saving: { name: "loader", className: "animate-spin" },
  saved: { name: "check", className: "text-success" },
  failed: { name: "alert-triangle", className: "text-warning" },
  paused: { name: "alert-triangle", className: "text-warning" },
};

export function SaveStatus() {
  const editor = useEditorStore();
  const { status } = useSaveSession(editor);
  const dirty = useEditorState(() => isCore(editor) && editor.dirty().length > 0);
  const view: SaveView = status === "idle" && dirty ? "pending" : status;
  const label = view === "pending" ? PENDING_LABEL : SAVE_LABELS[view];
  const icon = ICON[view];
  return (
    <span data-slot="SaveStatus" data-save-status={view} role="status" aria-live={status === "failed" ? "assertive" : "polite"} aria-label={label} {...tooltip(label)} className="inline-flex items-center gap-1.5">
      <Icon name={icon.name} className={`size-4 shrink-0 ${icon.className ?? ""}`} />
      <span data-save-text="" className="text-base-content/70 hidden w-32 truncate text-xs lg:inline-block">
        {SAVE_TEXT[view]}
        {view === "failed" && (
          <>
            {" · "}
            <button type="button" data-save-retry="" className="text-base-content font-medium underline underline-offset-2" onClick={() => saveSession(editor).retry()}>
              Try again
            </button>
          </>
        )}
      </span>
    </span>
  );
}
