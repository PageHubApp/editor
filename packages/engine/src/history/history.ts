/**
 * Undo history from inverse change sets. `user`, `content` and `ai` edits enter it (an AI
 * edit is dispatched when the human accepts it, one step per accepted edit); `remote` and
 * `plugin` edits don't — they rebase the stacks instead. Grouping: the same command within
 * 500 ms is one step (a slider drag); text edits on one handle until blur or 500 ms idle are
 * one step (a transaction's own `group` decides when it has one: a fresh group is a step of its own);
 * `annotations.history: "merge"` joins the previous step. Effect-only
 * transactions (selection, zoom, panels) never enter history.
 */
import { contributes } from "../commands/contributes";
import { defineCommand } from "../commands/defineCommand";
import { StateEffect, StateField, effectsOf } from "../state/state";
import type { ChangeSet } from "../state/changes";
import type { Mapping } from "../state/mapping";
import type { Origin, Transaction } from "../state/transaction";
import type { Extension } from "../extensions/extension";

export const GROUP_DELAY = 500;

export interface HistoryEntry {
  /** Applies to the current document: undoes (on `done`) or redoes (on `undone`) the step. */
  readonly changes: ChangeSet;
  /** The step's own mapping, inverted on undo so handles follow moved nodes; null once rebased. */
  readonly mapping: Mapping | null;
  readonly origin: Origin;
  readonly command?: string;
  readonly group?: unknown;
  readonly time: number;
}

export interface HistoryState {
  readonly done: readonly HistoryEntry[];
  readonly undone: readonly HistoryEntry[];
  /** A blur / explicit close: the next edit starts a new step. */
  readonly closed: boolean;
}

/** Close the current group (dispatch on blur). */
export const closeHistoryGroup = StateEffect.define<null>("closeHistoryGroup");

const RECORDED: ReadonlySet<Origin> = new Set(["user", "content", "ai"]);

/** Rebase a stack (top = last) through a change applied to the current document. */
function rebaseStack(stack: readonly HistoryEntry[], remote: ChangeSet): HistoryEntry[] {
  const out = [...stack];
  for (let i = out.length - 1; i >= 0 && !remote.empty; i--) {
    const e = out[i]!;
    out[i] = { ...e, changes: e.changes.rebase(remote), mapping: null };
    remote = remote.rebase(e.changes);
  }
  return out;
}

const entryOf = (tr: Transaction): HistoryEntry => ({
  changes: tr.changes.invert(tr.startState.files),
  mapping: tr.mapping,
  origin: tr.annotations.origin,
  command: tr.annotations.command,
  group: tr.annotations.group,
  time: tr.annotations.time,
});

/**
 * Two steps belong to one run when they share a `group` (a typing group on one handle, a
 * commit that names its own); a step with a group never merges with one without or with
 * another. Ungrouped steps merge when they come from the same command (a slider drag).
 */
const sameRun = (a: HistoryEntry, b: HistoryEntry): boolean =>
  a.group !== undefined || b.group !== undefined ? a.group === b.group : !!b.command && a.command === b.command;

export const historyField = StateField.define<HistoryState>({
  name: "history",
  create: () => ({ done: [], undone: [], closed: false }),
  update(h, tr) {
    const a = tr.annotations;
    if (a.undo) {
      const [from, to] = a.undo === "undo" ? (["done", "undone"] as const) : (["undone", "done"] as const);
      const entry = h[from].at(-1)!;
      const back: HistoryEntry = { ...entry, changes: tr.changes.invert(tr.startState.files), mapping: tr.mapping };
      return { ...h, [from]: h[from].slice(0, -1), [to]: [...h[to], back], closed: true } as HistoryState;
    }
    if (tr.changes.empty) return effectsOf(tr, closeHistoryGroup).length && !h.closed ? { ...h, closed: true } : h;
    if (a.history === false || !RECORDED.has(a.origin)) {
      return { done: rebaseStack(h.done, tr.changes), undone: rebaseStack(h.undone, tr.changes), closed: h.closed };
    }
    const entry = entryOf(tr);
    const prev = h.done.at(-1);
    const recent = !!prev && entry.time - prev.time < GROUP_DELAY;
    const merge =
      !!prev &&
      (a.history === "merge" ||
        (!h.closed &&
          recent &&
          entry.origin !== "ai" &&
          prev.origin === entry.origin &&
          sameRun(prev, entry)));
    const done = merge
      ? [
          ...h.done.slice(0, -1),
          { ...entry, changes: entry.changes.compose(prev!.changes), mapping: prev!.mapping && entry.mapping && prev!.mapping.concat(entry.mapping) },
        ]
      : [...h.done, entry];
    return { done, undone: [], closed: effectsOf(tr, closeHistoryGroup).length > 0 };
  },
});

function step(kind: "undo" | "redo") {
  return defineCommand({
    id: `history.${kind}`,
    title: kind === "undo" ? "Undo" : "Redo",
    run({ state, tr, dispatch }) {
      if (!state.hasField(historyField)) return false;
      const h = state.field(historyField);
      const entry = (kind === "undo" ? h.done : h.undone).at(-1);
      if (!entry) return false;
      if (dispatch) {
        if (entry.mapping) tr.applyMapping(entry.mapping.invert());
        else tr.applyChanges(entry.changes);
        dispatch(tr.annotate({ undo: kind, origin: "user" }));
      }
      return true;
    },
  });
}

export const undo = step("undo");
export const redo = step("redo");

/** History as an extension: the field, undo / redo commands and their keys. */
export function history(): Extension {
  return [
    historyField,
    undo,
    redo,
    contributes({
      keybindings: [
        { command: "history.undo", key: "mod+z", when: "!textEditing" },
        { command: "history.redo", key: "mod+shift+z", when: "!textEditing" },
        { command: "history.redo", key: "ctrl+y", when: "!textEditing" },
      ],
    }),
  ];
}
