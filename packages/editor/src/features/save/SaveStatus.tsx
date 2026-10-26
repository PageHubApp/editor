/**
 * The default `SaveStatus` slot: the save icon the top bar's Save button shows — floppy "All
 * changes saved", spinner "Saving…", green check "Saved", amber warning "Save failed — your
 * changes are unsaved" (read out assertively), and amber "Editing is paused" when the host froze writes.
 */
import { useEditorStore } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";
import { Icon, type IconName } from "../../primitives/icons";
import { useSaveSession, type SaveStatus as Status } from "./saveSession";

export const SAVE_LABELS: Readonly<Record<Status, string>> = {
  idle: "All changes saved",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed — your changes are unsaved",
  paused: "Editing is paused — your changes are unsaved",
};

const ICON: Readonly<Record<Status, { name: IconName; className?: string }>> = {
  idle: { name: "floppy" },
  saving: { name: "loader", className: "animate-spin" },
  saved: { name: "check", className: "text-success" },
  failed: { name: "alert-triangle", className: "text-warning" },
  paused: { name: "alert-triangle", className: "text-warning" },
};

export function SaveStatus() {
  const { status } = useSaveSession(useEditorStore());
  const label = SAVE_LABELS[status];
  const icon = ICON[status];
  return (
    <span data-slot="SaveStatus" data-save-status={status} role="status" aria-live={status === "failed" ? "assertive" : "polite"} aria-label={label} {...tooltip(label)} className="inline-flex items-center">
      <Icon name={icon.name} className={`size-4 ${icon.className ?? ""}`} />
    </span>
  );
}
