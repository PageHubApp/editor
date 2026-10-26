/** `data-edit-id` values in source text (a fast scan, no parse) and the site-uniqueness check adapters run on write. */
import { EDIT_ID_PATTERN } from "../attributes/editAttributes";

const ID_ATTR = /\sdata-edit-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

/** Every valid `data-edit-id` value in `text`, in document order (duplicates kept). */
export function editIdsIn(text: string): string[] {
  if (!text.includes("data-edit-id")) return [];
  const out: string[] = [];
  for (const m of text.matchAll(ID_ATTR)) {
    const v = m[1] ?? m[2] ?? m[3] ?? "";
    if (EDIT_ID_PATTERN.test(v)) out.push(v);
  }
  return out;
}

/** Raised by a storage `write` when the text carries an id another file already uses; the caller re-runs the save. */
export class EditIdConflictError extends Error {
  constructor(
    readonly path: string,
    readonly ids: string[],
  ) {
    super(`${path}: data-edit-id ${ids.join(", ")} already used in another file`);
    this.name = "EditIdConflictError";
  }
}

/** Throw when `text` reuses an id from `others` (site-unique ids). */
export function assertUniqueEditIds(path: string, text: string, others: Iterable<string>): void {
  const mine = new Set(editIdsIn(text));
  if (!mine.size) return;
  const clash = new Set<string>();
  for (const other of others) for (const id of editIdsIn(other)) if (mine.has(id)) clash.add(id);
  if (clash.size) throw new EditIdConflictError(path, [...clash]);
}
