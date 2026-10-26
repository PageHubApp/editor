/**
 * One transaction type for every change: text changes (a multi-file change set), session
 * effects, and annotations (origin, history hint, command id, time). Its mapping remaps
 * handles and offsets. Built by `TransactionBuilder`, or directly for undo / remote edits.
 */
import { ChangeSet, type Path } from "./changes";
import { Mapping } from "./mapping";
import type { EditorState, EffectValue, SourceTree } from "./state";

export type Origin = "user" | "ai" | "remote" | "plugin" | "content";

export interface Annotations {
  origin: Origin;
  /** false: never enters history; "merge": joins the previous history step. */
  history?: boolean | "merge";
  /** Id of the command that produced it (history groups by it). */
  command?: string;
  time: number;
  /** Text edits on one handle group into one history step (set by `setText`). */
  group?: unknown;
  /** Engine bookkeeping (persisted-id stamping on open / save): not a user edit; role gates skip it. */
  system?: boolean;
  /** Set on the transactions history itself dispatches. */
  undo?: "undo" | "redo";
}

export class Transaction {
  private constructor(
    readonly startState: EditorState,
    readonly changes: ChangeSet,
    readonly effects: readonly EffectValue<unknown>[],
    readonly annotations: Readonly<Annotations>,
    readonly mapping: Mapping,
    /** Trees the builder already parsed for the new texts (reused by the next state). */
    readonly trees: readonly SourceTree[],
    /** Storage versions to record (after a save). */
    readonly versions?: ReadonlyMap<Path, string>,
  ) {}

  static create(
    startState: EditorState,
    spec: {
      changes?: ChangeSet;
      mapping?: Mapping;
      effects?: readonly EffectValue<unknown>[];
      annotations?: Partial<Annotations>;
      trees?: readonly SourceTree[];
      versions?: ReadonlyMap<Path, string>;
      inverse?: ChangeSet;
    },
  ): Transaction {
    const changes = spec.changes ?? ChangeSet.empty;
    const mapping = spec.mapping ?? Mapping.of(changes, spec.inverse ?? changes.invert(startState.files));
    return new Transaction(
      startState,
      changes,
      spec.effects ?? [],
      { origin: "user", time: Date.now(), ...spec.annotations },
      mapping,
      spec.trees ?? [],
      spec.versions,
    );
  }

  get docChanged(): boolean {
    return !this.changes.empty;
  }
}
