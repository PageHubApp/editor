/**
 * `pagehub pull <siteId> [dir]`: write a hosted site's files into a folder, in the remote layout (`site.json`,
 * `theme.css`, `pages/`, `partials/`, `sections/`, `assets/`), and remember each file's version in `.pagehub/`.
 *
 * Pulling again over a folder you have edited never overwrites an edit silently:
 *   - a file changed only on the server is updated; a file you changed and the server did not is kept
 *   - a file changed on both sides is left alone: the server's copy goes to `.pagehub/theirs/<path>` (with the common
 *     ancestor in `.pagehub/base/<path>`) and the command exits 1 with the merge command
 *   - `--rebase` keeps your files and treats them as based on the server's current versions (after a merge)
 *   - `--force` takes the server's text for every file that differs, discarding local edits
 */
import { mkdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Client } from "./remote/client";
import { compare, plural, type Comparison } from "./remote/compare";
import { hashText } from "./remote/paths";
import { basePath, baseAt, clearTheirs, dropBase, removeAt, saveBase, saveTheirs, theirsPath, writeAt, writeState, readState, type SyncState } from "./remote/state";

export interface PullOptions {
  client: Client;
  siteId: string;
  dir: string;
  force?: boolean;
  rebase?: boolean;
  log?: (line: string) => void;
}

export interface PullResult {
  updated: string[];
  added: string[];
  removed: string[];
  /** Local edits left in place because the server did not change those files. */
  keptLocal: string[];
  conflicts: string[];
}

/** Merge hint for a conflicted file: the three-way merge git ships. */
export const mergeCommand = (path: string) => `git merge-file ${path} ${basePath(path)} ${theirsPath(path)}`;

export async function pull({ client, siteId, dir: dirArg, force = false, rebase = false, log = console.log }: PullOptions): Promise<PullResult> {
  const dir = resolve(dirArg);
  const previous = readState(dir);
  if (previous && previous.siteId !== siteId) throw new Error(`${dir} holds site ${previous.siteId}, not ${siteId}. Pull into another folder.`);
  mkdirSync(dir, { recursive: true });

  // A fresh pull into a folder that already has files is the same comparison with an empty state: a name clash with
  // different text comes out as a conflict below, and nothing else is touched.
  const [listing, pages] = await Promise.all([client.listFiles(siteId), client.listPages(siteId)]);
  const state: SyncState = previous ?? { format: 1, siteId, baseUrl: client.baseUrl, siteVersion: 0, syncedAt: "", files: {}, pages: [] };
  const cmp = compare(dir, state, listing);
  const conflicts = new Set(cmp.conflicts);
  const localEdited = new Set([...cmp.local.modified, ...cmp.local.added, ...cmp.local.deleted]);

  // What to read from the server: everything new or changed there (conflicts too: their text goes to `theirs/`), plus on
  // --force every file you edited that the server still has.
  const wanted = new Set<string>([...cmp.remote.modified, ...cmp.remote.added]);
  if (force) for (const p of localEdited) if (p in listing.versions) wanted.add(p);
  const texts = await client.readFiles(siteId, [...wanted].sort());

  const result: PullResult = { updated: [], added: [], removed: [], keptLocal: [], conflicts: [] };
  const files = { ...state.files };

  const adopt = (path: string, text: string, version: string, localText = text) => {
    files[path] = { version, localHash: hashText(localText) };
    saveBase(dir, path, text);
  };
  const forget = (path: string) => {
    delete files[path];
    dropBase(dir, path);
  };

  for (const path of [...cmp.remote.modified, ...cmp.remote.added].sort()) {
    const remote = texts[path]!;
    const version = listing.versions[path]!;
    if (conflicts.has(path) && !force) {
      if (rebase) {
        adopt(path, remote.text, version); // your text stays on disk; it now differs from this base, so it shows as an edit
        clearTheirs(dir, path);
      } else {
        if (baseAt(dir, path) === undefined) saveBase(dir, path, ""); // added on both sides: the common ancestor is empty
        saveTheirs(dir, path, remote.text);
        result.conflicts.push(path);
      }
      continue;
    }
    writeAt(dir, path, remote.text);
    adopt(path, remote.text, version);
    clearTheirs(dir, path);
    (path in state.files ? result.updated : result.added).push(path);
  }

  for (const path of cmp.remote.deleted.sort()) {
    if (conflicts.has(path) && !force) {
      if (rebase) forget(path); // your copy becomes a new file that `push` re-creates
      else result.conflicts.push(path);
      continue;
    }
    removeAt(dir, path);
    forget(path);
    clearTheirs(dir, path);
    result.removed.push(path);
  }

  for (const path of cmp.converged) {
    const version = listing.versions[path];
    if (version === undefined) forget(path);
    else adopt(path, cmp.texts[path]!, version);
  }

  if (force) {
    // Your edits to files the server did not change are discarded too (the server's text was read above).
    for (const path of localEdited) {
      if (conflicts.has(path) || !(path in texts)) continue;
      writeAt(dir, path, texts[path]!.text);
      adopt(path, texts[path]!.text, texts[path]!.version);
      result.updated.push(path);
    }
  } else {
    for (const path of localEdited) if (!conflicts.has(path) && !cmp.converged.includes(path)) result.keptLocal.push(path);
  }

  writeState(dir, { ...state, baseUrl: state.baseUrl, siteVersion: listing.version, syncedAt: new Date().toISOString(), files, pages });
  report(log, siteId, dir, result, cmp, listing.versions, rebase);
  return result;
}

function report(log: (line: string) => void, siteId: string, dir: string, r: PullResult, cmp: Comparison, remote: Record<string, string>, rebase: boolean): void {
  const rel = relative(process.cwd(), dir);
  const where = rel.startsWith("..") ? dir : rel || ".";
  log(`${siteId} → ${where}: ${plural(r.added.length, "file")} added, ${plural(r.updated.length, "file")} updated, ${plural(r.removed.length, "file")} removed`);
  if (r.keptLocal.length) log(`kept your local edits to ${plural(r.keptLocal.length, "file")} (the server did not change them): ${r.keptLocal.join(", ")}`);
  if (cmp.misnamed.length) log(`not pushable (the server would refuse the name): ${cmp.misnamed.join(", ")}`);
  if (rebase && cmp.conflicts.length) log(`rebased ${plural(cmp.conflicts.length, "file")} onto the server's versions; \`pagehub push\` will overwrite the server's changes to them`);
  for (const path of r.conflicts) {
    const kept = path in remote;
    log(`conflict  ${path}  changed here and ${kept ? "on the server" : "deleted on the server"}`);
    if (kept) {
      log(`  server copy  ${theirsPath(path)}`);
      log(`  merge        ${mergeCommand(path)}`);
    }
  }
  if (r.conflicts.length) {
    log(`\n${plural(r.conflicts.length, "file")} not updated. After merging: \`pagehub pull --rebase\` keeps your files on the server's current versions; \`pagehub pull --force\` discards your edits and takes the server's.`);
  }
}
