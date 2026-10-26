/**
 * Autosave: save dirty files shortly after edits stop, without ever fighting the person or the server.
 *
 * - Timing: `idleMs` after the editor's own debounced `change` (so about 1.5 s after the last edit), and at most
 *   `maxWaitMs` after the first unsaved edit during continuous work. Saves never start closer than `minGapMs` apart
 *   (the host's files route allows 30 per minute per user; the defaults stay at 15 a minute at the very worst).
 * - Waits (never drops) while `isBusy()` says a gesture is in flight (a drag, an IME composition).
 * - A file a rule blocked is not tried again until its text changes. A conflict stops autosave until it is settled
 *   (`resolveConflict` saves by itself). A failure that retrying can't fix (`format_changed`, `not-found`) stops it for
 *   good; `forbidden` / `too-large` wait for the next edit; `network` / `unknown` back off (3 s doubling to 60 s,
 *   at least 30 s after a 429) and give up after `MAX_FAILURES` until the next edit; `maintenance` is a pause, polled
 *   every `pausedRetryMs` until the host lifts it.
 * - `flush()` is for leaving (navigating, hiding the tab, unmounting): it saves now, ignoring the gap, backoff and gestures.
 */
import { isStorageError } from "../storage/storageError";
import type { Editor, SaveResult } from "./createEditor";
import type { Path } from "../state/changes";

export interface AutosaveOptions {
  /** Quiet time after the editor's `change` event. Default 1000. */
  idleMs?: number;
  /** Longest an unsaved edit waits during continuous work. Default 10000. */
  maxWaitMs?: number;
  /** Shortest time between two save starts. Default 4000. */
  minGapMs?: number;
  /** How often to retry while the host has paused editing (maintenance). Default 20000. */
  pausedRetryMs?: number;
  /** True while a gesture is in flight: saving waits. */
  isBusy?: () => boolean;
  /** Called before a flush so buffered edits (typed text) reach the files first. */
  beforeFlush?: () => void;
}

export interface Autosave {
  /** Save now (leaving the page); resolves when the write settled. Never throws. */
  flush(): Promise<SaveResult | null>;
  /** Save soon, as fast as the gap and backoff allow (the window lost focus). */
  nudge(): void;
  /** Dirty files autosave can't or won't write right now (conflict, rule errors, repeated failure, stopped): leaving needs a warning. */
  unsaveable(): boolean;
  stop(): void;
}

const MAX_FAILURES = 6;
const PERMANENT = new Set(["format_changed", "not-found"]);
const UNTIL_NEXT_EDIT = new Set(["forbidden", "too-large", "conflict"]);

export function autosave(editor: Editor, opts: AutosaveOptions = {}): Autosave {
  const idleMs = opts.idleMs ?? 1000;
  const maxWaitMs = opts.maxWaitMs ?? 10_000;
  const minGapMs = opts.minGapMs ?? 4000;
  const pausedRetryMs = opts.pausedRetryMs ?? 20_000;
  if (editor.role === "viewer") return { flush: async () => null, nudge() {}, unsaveable: () => false, stop() {} };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let firstDirtyAt: number | null = null;
  let lastStart = -Infinity;
  let notBefore = 0; // backoff
  let failures = 0;
  let halted: "permanent" | "edit" | null = null;
  let paused = false;
  const blocked = new Map<Path, string>(); // path → the text a rule refused

  const now = () => Date.now();
  const eligible = (): Path[] => editor.dirty().filter((p) => blocked.get(p) !== editor.state.files.get(p));

  function plan(immediate = false): void {
    clearTimeout(timer);
    if (stopped || halted === "permanent" || editor.conflicts.size) return;
    const paths = eligible();
    if (!paths.length) {
      firstDirtyAt = null;
      return;
    }
    if (failures >= MAX_FAILURES && !paused) return;
    firstDirtyAt ??= now();
    const wait = immediate ? 0 : Math.max(0, Math.min(idleMs, firstDirtyAt + maxWaitMs - now()));
    const delay = Math.max(wait, lastStart + minGapMs - now(), notBefore - now());
    timer = setTimeout(run, delay);
  }

  function run(): void {
    if (stopped) return;
    if (editor.saving) return; // `saved` / `saveFailed` re-plan
    if (opts.isBusy?.()) {
      timer = setTimeout(run, 300);
      return;
    }
    void attempt();
  }

  async function attempt(): Promise<SaveResult | null> {
    const paths = eligible();
    if (!paths.length) return null;
    const snapshot = new Map(paths.map((p) => [p, editor.state.files.get(p)!]));
    lastStart = now();
    firstDirtyAt = null;
    let result: SaveResult | null = null;
    try {
      result = await editor.save({ paths });
      failures = 0;
      paused = false;
      halted = null;
      for (const b of result.blocked) blocked.set(b.path, snapshot.get(b.path) ?? "");
      for (const p of result.written) blocked.delete(p);
    } catch (e) {
      failures++;
      if (isStorageError(e)) {
        if (PERMANENT.has(e.code)) halted = "permanent";
        else if (UNTIL_NEXT_EDIT.has(e.code)) halted = "edit";
        else if (e.code === "maintenance") {
          paused = true;
          notBefore = now() + pausedRetryMs;
        } else {
          notBefore = now() + Math.max(Math.min(3000 * 2 ** (failures - 1), 60_000), e.status === 429 ? 30_000 : 0);
        }
      } else notBefore = now() + Math.min(3000 * 2 ** (failures - 1), 60_000);
    }
    // A save that wrote nothing (conflict, everything blocked) is not retried until something changes.
    if (!result || result.written.length) plan();
    return result;
  }

  const offChange = editor.on("change", () => {
    if (halted === "edit") halted = null;
    if (failures >= MAX_FAILURES) failures = 0;
    plan();
  });
  const offSaved = editor.on("saved", () => plan());

  return {
    async flush() {
      clearTimeout(timer);
      if (stopped) return null;
      try {
        opts.beforeFlush?.();
        if (editor.conflicts.size) return null;
        return await editor.save({ paths: eligible() });
      } catch {
        return null;
      }
    },
    nudge: () => plan(true),
    unsaveable() {
      if (!editor.dirty().length) return false;
      return Boolean(editor.conflicts.size) || halted !== null || paused || failures > 0 || editor.dirty().some((p) => blocked.has(p) && blocked.get(p) === editor.state.files.get(p));
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      offChange();
      offSaved();
    },
  };
}
