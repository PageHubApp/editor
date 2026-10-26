/**
 * Autosave for `<Editor autosave>`: the engine's `autosave` (debounced, rate-limited, conflict- and failure-aware)
 * plus the page-level triggers that flush it. Flushes on: the tab hiding or the page going away (`visibilitychange`,
 * `pagehide`, `beforeunload` — the host storage should send with `keepalive`), the window losing focus for real
 * (focus moving into the canvas iframe doesn't count), the editor going inactive, and unmount (switching sites).
 * Gestures (`saveHolds`) make it wait; the save status and banner are the existing `saveSession`.
 */
import { useEffect } from "react";
import { autosave, type Autosave, type AutosaveOptions, type Store } from "@pagehub/engine";
import { isCore } from "../../react/events";
import { autosaveHeld, commitPending } from "./saveHolds";

const controllers = new WeakMap<object, Autosave>();

/** The running autosave of an editor, if any (the leave warning asks it whether edits are safe). */
export const autosaveOf = (editor: Store): Autosave | undefined => controllers.get(editor);

export function useAutosave(editor: Store, option: boolean | AutosaveOptions | undefined, active = true): void {
  const on = Boolean(option);
  const opts = typeof option === "object" ? option : undefined;
  useEffect(() => {
    if (!on || !isCore(editor) || typeof window === "undefined") return;
    const auto = autosave(editor, { ...opts, isBusy: autosaveHeld, beforeFlush: commitPending });
    controllers.set(editor, auto);
    const leave = () => void auto.flush();
    const onVisibility = () => document.visibilityState === "hidden" && leave();
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onBlur = () => {
      clearTimeout(blurTimer);
      // Focus moving into the canvas iframe blurs the window too; only a real loss of focus saves.
      blurTimer = setTimeout(() => !document.hasFocus() && auto.nudge(), 200);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("blur", onBlur);
      clearTimeout(blurTimer);
      leave();
      auto.stop();
      if (controllers.get(editor) === auto) controllers.delete(editor);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options are read once per editor
  }, [editor, on]);
  useEffect(() => {
    if (!active && isCore(editor)) void controllers.get(editor)?.flush();
  }, [editor, active]);
}
