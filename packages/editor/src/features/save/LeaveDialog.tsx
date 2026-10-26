/**
 * "Leave without saving?" for a host's router. The editor is URL-free, so it cannot cancel a
 * route change itself: the host intercepts navigation while `hasUnsaved(editor)`, shows this
 * dialog, and either proceeds (`onLeave`) or stays. The tab-close half is `useUnsavedWarning`.
 */
import { useRef } from "react";
import { ConfirmDialog } from "../../primitives/ConfirmDialog";
import { isCore } from "../../react/events";
import type { Store } from "@pagehub/engine";

/** True while any file differs from what storage holds (what the host's route guard asks). */
export const hasUnsaved = (editor: Store): boolean => isCore(editor) && editor.dirty().length > 0;

export function LeaveDialog({ isOpen, onLeave, onStay }: { isOpen: boolean; onLeave(): void; onStay(): void }) {
  const leaving = useRef(false); // ConfirmDialog closes after confirming; that close is not "Stay"
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={() => (leaving.current ? (leaving.current = false) : onStay())}
      onConfirm={() => ((leaving.current = true), onLeave())}
      title="Leave without saving?"
      message="Your latest changes haven't saved yet. If you leave now, they'll be lost."
      confirmText="Leave"
      cancelText="Stay"
      variant="warning"
    />
  );
}
