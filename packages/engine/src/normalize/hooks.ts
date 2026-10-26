/**
 * Normalization phases, run by `Store.dispatch` around every transaction:
 *
 * - `before(tr, state)` — rewrite (return a new transaction on the same start state) or veto
 *   (`false`, or `{ veto: reason }`). Runs on the dispatched transaction only, in precedence
 *   order; appended transactions don't pass through `before` again.
 * - `after(state, tr)` — append: return a builder on `state` (the current state) or null. The
 *   appended transaction joins the triggering one's history step. Read positions from `state`;
 *   `tr` says what triggered the hook (its offsets may be stale once another hook appended).
 * - `onBatchComplete(state)` — once per dispatch, after every append and before listeners run.
 *
 * A hook may never dispatch (it is called inside dispatch, like a listener). An `after` hook
 * that appends more than `AFTER_LOOP_LIMIT` times in one dispatch throws (loop guard).
 */
import { normalizersFacet } from "../extensions/facets";
import type { Extension } from "../extensions/extension";
import type { EditorState } from "../state/state";
import type { Transaction } from "../state/transaction";
import type { TransactionBuilder } from "../state/builder";

export const AFTER_LOOP_LIMIT = 10;

export type BeforeResult = Transaction | false | { veto: string } | null | undefined | void;
export type BeforeHook = (tr: Transaction, state: EditorState) => BeforeResult;
export type AfterHook = (state: EditorState, tr: Transaction) => TransactionBuilder | null | undefined | void;
export type BatchCompleteHook = (state: EditorState) => void;

export interface Veto {
  hook: string;
  reason: string;
}

interface Entry<P extends string, F> {
  phase: P;
  name: string;
  run: F;
}
export type BeforeEntry = Entry<"before", BeforeHook>;
export type AfterEntry = Entry<"after", AfterHook>;
export type BatchCompleteEntry = Entry<"batchComplete", BatchCompleteHook>;

/** A `before` hook: rewrite or veto each dispatched transaction. */
export function beforeTransaction(name: string, run: BeforeHook): Extension {
  return normalizersFacet.of({ phase: "before", name, run } satisfies BeforeEntry);
}

/** An `after` hook: append changes in the same history step. */
export function afterTransaction(name: string, run: AfterHook): Extension {
  return normalizersFacet.of({ phase: "after", name, run } satisfies AfterEntry);
}

/** Runs once per dispatch after all appends (rules, diagnostics, caches). Must not dispatch. */
export function onBatchComplete(name: string, run: BatchCompleteHook): Extension {
  return normalizersFacet.of({ phase: "batchComplete", name, run } satisfies BatchCompleteEntry);
}

export function hooksOf(state: EditorState): { before: readonly BeforeEntry[]; after: readonly AfterEntry[]; batchComplete: readonly BatchCompleteEntry[] } {
  const all = state.facet(normalizersFacet) as Record<string, readonly unknown[] | undefined>;
  return {
    before: (all.before ?? []) as BeforeEntry[],
    after: (all.after ?? []) as AfterEntry[],
    batchComplete: (all.batchComplete ?? []) as BatchCompleteEntry[],
  };
}

/** Run `before` hooks: the (possibly rewritten) transaction, or the veto. */
export function runBefore(state: EditorState, tr: Transaction): { tr: Transaction } | { veto: Veto } {
  for (const h of hooksOf(state).before) {
    const r = h.run(tr, state);
    if (r === false) return { veto: { hook: h.name, reason: `vetoed by ${h.name}` } };
    if (r && typeof r === "object" && "veto" in r) return { veto: { hook: h.name, reason: r.veto } };
    if (r) {
      if (r.startState !== state) throw new Error(`before hook "${h.name}" returned a transaction for a different state`);
      tr = r;
    }
  }
  return { tr };
}

/** Annotations for a transaction appended after `base`: same origin and time, same history step. */
export function appendedAnnotations(base: Transaction): Partial<Transaction["annotations"]> {
  const a = base.annotations;
  const history = a.history === false || a.undo ? false : "merge";
  return { origin: a.origin, time: a.time, history, command: a.command, group: a.group };
}
