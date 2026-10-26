/**
 * Closing or reloading the tab with unsaved changes gets the browser's own `beforeunload`
 * prompt (the only thing a browser allows there). Dirtiness is read when the event fires, so a
 * save that just finished never prompts. Leaving through the host's router is the host's call:
 * it asks `editor.dirty()` (a host plugin can show its "Leave without saving?" dialog).
 */
import { useEffect } from "react";
import type { Store } from "@pagehub/engine";
import { isCore } from "../../react/events";
import { autosaveOf } from "./useAutosave";

export function useUnsavedWarning(editor: Store, active = true): void {
  useEffect(() => {
    if (!active || !isCore(editor) || typeof window === "undefined") return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!editor.dirty().length) return;
      // With autosave the leave flush (keepalive) is already on its way; warn only for edits it can't save.
      const auto = autosaveOf(editor);
      if (auto && !auto.unsaveable()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [editor, active]);
}
