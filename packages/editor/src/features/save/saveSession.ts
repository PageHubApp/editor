/**
 * What the top bar's save icon and the save banner show, per editor, from the core's events:
 * - `saving` → status "saving";
 * - `saved` → "saved", back to "idle" after 3000ms;
 * - `saveFailed` / `conflict` → "failed", back to "idle" after 5000ms; the banner explains it
 *   (blocked by rule errors, a storage error, or a file that changed elsewhere — the last one
 *   offers Reload / Keep mine through `resolveConflict`).
 * - a `StorageError` says why in its own words (`describeSaveError`); `maintenance` is "paused" — the host froze
 *   edits on purpose — which is not an error: it stays until the next save works, with "Try again".
 * Session-only chrome state: never in history, never in the document.
 */
import { useSyncExternalStore } from "react";
import { describeNestingFixes, isStorageError, type Editor as Core, type Path, type Store } from "@pagehub/engine";
import { isCore } from "../../react/events";

export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "paused";
export const SAVED_MS = 3000;
export const FAILED_MS = 5000;

type SaveBannerState =
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "paused"; message: string }
  | { kind: "conflict"; paths: Path[] }
  /** Not a failure: a file opened with invalid HTML nesting and was repaired; a save writes the fix. */
  | { kind: "notice"; message: string };

interface SaveSessionState {
  status: SaveStatus;
  banner: SaveBannerState | null;
}

interface SaveSession {
  get(): SaveSessionState;
  subscribe(fn: () => void): () => void;
  dismiss(): void;
  /** Save again (the banner's "Try again"). */
  retry(): void;
  /** Reload the stored text of every conflicted file (local edits to them are dropped), or keep ours. */
  resolve(how: "reload" | "override"): Promise<void>;
}

const IDLE: SaveSessionState = { status: "idle", banner: null };
const sessions = new WeakMap<object, SaveSession>();

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e ?? ""));

/** What to tell the person about a failed save: the banner kind, the words, and whether "Try again" can help. */
export function describeSaveError(error: unknown): { kind: "error" | "paused"; message: string; retry: boolean } {
  if (isStorageError(error)) {
    switch (error.code) {
      case "maintenance":
        return { kind: "paused", message: error.detail ?? "Editing is paused while the site is being upgraded. Your changes are kept here. Try again in a few minutes.", retry: true };
      case "network":
        return { kind: "error", message: "Can't reach the server. Your changes are unsaved. Check your connection and try again.", retry: true };
      case "format_changed":
        return { kind: "error", message: "This site was upgraded while you had it open. Reload the page to keep editing; the changes made here can't be saved.", retry: false };
      case "forbidden":
        return { kind: "error", message: "You're signed out or no longer allowed to edit this site. Your changes are unsaved.", retry: false };
      case "not-found":
        return { kind: "error", message: "This site no longer exists. Your changes are unsaved.", retry: false };
      case "too-large":
        return { kind: "error", message: "This save is too large for the server. Your changes are unsaved.", retry: false };
      case "conflict":
        return { kind: "error", message: "The site changed on the server since you opened it. Reload the page to see the latest version.", retry: false };
    }
  }
  return { kind: "error", message: `Save failed — your changes are unsaved. ${errorText(error)}`.trim(), retry: true };
}

function createSession(core: Core | null): SaveSession {
  let state = IDLE;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: Partial<SaveSessionState>) => {
    state = { ...state, ...next };
    for (const l of [...listeners]) l();
  };
  const settle = (status: "saved" | "failed" | "paused") => {
    clearTimeout(timer);
    set({ status });
    if (status === "paused") return; // stays until a save works
    timer = globalThis.setTimeout(() => set({ status: "idle" }), status === "saved" ? SAVED_MS : FAILED_MS);
    (timer as { unref?: () => void }).unref?.();
  };
  const conflictBanner = () => (core && core.conflicts.size ? { kind: "conflict" as const, paths: [...core.conflicts.keys()] } : null);
  const repairNotice = (): SaveBannerState | null => {
    const first = core?.repairs[0];
    if (!core || !first) return null;
    const message = describeNestingFixes(first.path, first.fixes);
    return { kind: "notice", message: core.repairs.length > 1 ? `${message} and ${core.repairs.length - 1} more ${core.repairs.length === 2 ? "file" : "files"}` : message };
  };
  if (core) {
    state = { ...state, banner: repairNotice() };
    core.on("repaired", () => set({ banner: repairNotice() }));
    core.on("saving", () => {
      clearTimeout(timer);
      set({ status: "saving" });
    });
    core.on("saved", () => {
      settle("saved");
      const b = state.banner;
      if ((b?.kind === "conflict" && !core.conflicts.size) || b?.kind === "notice" || b?.kind === "paused" || (b?.kind === "error" && b.retry)) set({ banner: null });
    });
    core.on("saveFailed", (e) => {
      const blocked = e.blocked[0];
      if (blocked) {
        settle("failed");
        return set({ banner: { kind: "error", message: `Couldn't save ${blocked.path}: ${blocked.errors[0] ?? "it has errors"}`, retry: false } });
      }
      const d = describeSaveError(e.error);
      settle(d.kind === "paused" ? "paused" : "failed");
      set({ banner: d.kind === "paused" ? { kind: "paused", message: d.message } : { kind: "error", message: d.message, retry: d.retry } });
    });
    core.on("conflict", () => {
      settle("failed");
      set({ banner: conflictBanner() });
    });
  }
  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    dismiss: () => set({ banner: null }),
    retry: () => void core?.save().catch(() => {}),
    async resolve(how) {
      if (!core) return;
      set({ banner: null });
      for (const path of [...core.conflicts.keys()]) await core.resolveConflict(path, how).catch(() => {});
    },
  };
}

/** The save session of an editor (created on first use). A plain store has no saves: always idle. */
export function saveSession(editor: Store): SaveSession {
  let s = sessions.get(editor);
  if (!s) sessions.set(editor, (s = createSession(isCore(editor) ? editor : null)));
  return s;
}

export function useSaveSession(editor: Store): SaveSessionState {
  const s = saveSession(editor);
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}
