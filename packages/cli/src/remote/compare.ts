/**
 * Local vs remote: what changed on each side since the last sync, and which files changed on both. The one function
 * `pull`, `push` and `status` all start from.
 */
import type { FileListing } from "./client";
import { hashText, walkLocal } from "./paths";
import { readAt, type SyncState } from "./state";

export interface SideChanges {
  modified: string[];
  added: string[];
  deleted: string[];
}

export interface Comparison {
  local: SideChanges;
  remote: SideChanges;
  /** Changed on both sides to different results: `push` refuses these, `pull` keeps your copy. */
  conflicts: string[];
  /** Added on both sides, or edited on both, to the same text: nothing to do but record it. */
  converged: string[];
  /** Files in a site folder whose name the server would refuse. */
  misnamed: string[];
  /** Text of every local file (read once). */
  texts: Record<string, string>;
}

const empty = (): SideChanges => ({ modified: [], added: [], deleted: [] });

export function compare(dir: string, state: SyncState, listing: FileListing): Comparison {
  const local = empty();
  const remote = empty();
  const walk = walkLocal(dir);
  const texts: Record<string, string> = {};
  const onDisk = new Set(walk.files);
  for (const path of walk.files) texts[path] = readAt(dir, path) ?? "";

  for (const [path, was] of Object.entries(state.files)) {
    if (!onDisk.has(path)) local.deleted.push(path);
    else if (hashText(texts[path]!) !== was.localHash) local.modified.push(path);

    const now = listing.versions[path];
    if (now === undefined) remote.deleted.push(path);
    else if (now !== was.version) remote.modified.push(path);
  }
  for (const path of walk.files) if (!(path in state.files)) local.added.push(path);
  for (const path of listing.paths) if (!(path in state.files)) remote.added.push(path);

  const localChanged = new Set([...local.modified, ...local.added, ...local.deleted]);
  const conflicts: string[] = [];
  const converged: string[] = [];
  for (const path of new Set([...remote.modified, ...remote.added, ...remote.deleted])) {
    if (!localChanged.has(path)) continue;
    const theirs = listing.versions[path];
    const mine = path in texts ? hashText(texts[path]!) : undefined;
    // Both deleted it, or both ended on the same text.
    if (mine === theirs) converged.push(path);
    else conflicts.push(path);
  }
  return { local, remote, conflicts: conflicts.sort(), converged: converged.sort(), misnamed: walk.misnamed, texts };
}

export const hasChanges = (c: SideChanges) => c.modified.length + c.added.length + c.deleted.length > 0;

/** How many lines differ between two texts (a multiset comparison: cheap, and right for "3 added, 1 removed"). */
export function lineDelta(before: string, after: string): { added: number; removed: number } {
  const count = new Map<string, number>();
  for (const line of before.split("\n")) count.set(line, (count.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split("\n")) {
    const n = count.get(line) ?? 0;
    if (n > 0) count.set(line, n - 1);
    else added++;
  }
  let removed = 0;
  for (const n of count.values()) removed += n;
  return { added, removed };
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
