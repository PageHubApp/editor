/**
 * Storage: where files live. One adapter per editor (`storage` facet). Writes are
 * optimistic — `write` gets the version the edit was based on and refuses (returning
 * `{ conflict: { theirs } }`) when the stored file moved on; nothing is overwritten.
 * `writeBatch` (optional) is the same for several files at once, all or nothing. A failure that is not a
 * conflict is a thrown `StorageError` with a `code` (see `storageError.ts`).
 * `watch` changes become `origin: "remote"` transactions. `editIds` serves persisted identity.
 *
 * `prepareWrite` hooks run per dirty file on save, before the write (rules with errors block,
 * sanitize fixes rewrite the text); content mode and persisted identity are built in.
 */
import { EXTENSION, defineFacet, type Extendable, type Extension } from "../extensions/extension";
import { storageFacet } from "../extensions/facets";
import type { EditorState } from "../state/state";
import type { Path } from "../state/changes";

export type WriteResult = { ok: true; version: string } | { ok: false; conflict: { theirs: string; version: string } };

/** One file in an atomic batch: its new text, or a delete. */
export type BatchChange = { path: Path; text: string } | { path: Path; delete: true };

export type BatchWriteResult =
  | { ok: true; versions: Record<Path, string> }
  | { ok: false; conflicts: Array<{ path: Path; theirs: string; version: string }> };

export interface StorageSpec {
  id: string;
  list(): Promise<Path[]>;
  read(path: Path): Promise<{ text: string; version: string } | null>;
  /** `baseVersion` null = the file must not exist yet. */
  write(path: Path, text: string, opts: { baseVersion: string | null }): Promise<WriteResult>;
  /**
   * Optional: write several files as ONE atomic save. Every change is applied or none is: if any path's
   * stored version differs from `baseVersions[path]` (`null` = must not exist), nothing is written and
   * the result lists every conflicting path with its stored text. `versions` has the new version of each
   * written file (none for a delete). The editor uses this when present, so one save is one write on the
   * host (one manifest update) instead of one per file. Failures other than a conflict throw a `StorageError`.
   */
  writeBatch?(changes: readonly BatchChange[], opts: { baseVersions: Readonly<Record<Path, string | null>> }): Promise<BatchWriteResult>;
  watch?(onChange: (path: Path) => void): () => void;
  /** Every `data-edit-id` in the site's files except `exceptPath` (identity: "persisted"). */
  editIds?(exceptPath?: Path): Promise<Set<string>>;
}

export interface StorageDef extends StorageSpec, Extendable {}

export function defineStorage(spec: StorageSpec): StorageDef {
  let ext: Extension | undefined;
  const def: StorageDef = {
    ...spec,
    [EXTENSION]: () => (ext ??= storageFacet.of(def)),
  };
  return def;
}

export function isStorage(v: unknown): v is StorageDef {
  return !!v && typeof v === "object" && typeof (v as StorageSpec).read === "function" && typeof (v as StorageSpec).write === "function";
}

export interface PrepareWriteInput {
  path: Path;
  /** Text about to be written (after earlier hooks). */
  text: string;
  /** Text the save is based on (last read / written), null for a new file. */
  base: string | null;
  state: EditorState;
  storage: StorageDef;
}

/** A replacement text (fixes, normalization) and/or errors that block this file's write. */
export interface PrepareWriteResult {
  text?: string;
  errors?: string[];
}

export interface PrepareWriteHook {
  name: string;
  run(input: PrepareWriteInput): PrepareWriteResult | void | Promise<PrepareWriteResult | void>;
}

/** Save-time hooks, run in precedence order (highest first) for each dirty file. */
export const prepareWriteFacet = defineFacet<PrepareWriteHook, readonly PrepareWriteHook[]>({ id: "prepareWrite", combine: (values) => values });

export function prepareWrite(name: string, run: PrepareWriteHook["run"]): Extension {
  return prepareWriteFacet.of({ name, run });
}
