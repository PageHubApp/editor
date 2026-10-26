/**
 * What `pull` remembers about a folder, in `<dir>/.pagehub/` (dot-folders are never pushed, linted or served):
 *
 *   state.json   the site, the server, and per file the version it had when pulled (`version`) and the hash of the text
 *                written to disk (`localHash`), so "edited here" is `hash(file) !== localHash` and "edited there" is
 *                `listing.versions[path] !== version`
 *   base/<path>  the text as pulled: the common ancestor when you merge a conflict
 *   theirs/<path> the server's text of a file that conflicted, written for the merge command
 *
 * `.pagehub/.gitignore` ignores all of it: it is per checkout, so a git clone starts with `pull`.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { RemotePage } from "./client";

export interface FileState {
  /** The server's version of the file when last synced. */
  version: string;
  /** Hash of the text on disk when last synced. */
  localHash: string;
}

export interface SyncState {
  format: 1;
  siteId: string;
  baseUrl: string;
  /** The site's content version at the last sync. */
  siteVersion: number;
  syncedAt: string;
  files: Record<string, FileState>;
  /** The site's page records at the last sync. */
  pages: RemotePage[];
}

export const STATE_DIR = ".pagehub";
const stateFile = (dir: string) => join(dir, STATE_DIR, "state.json");

export function readState(dir: string): SyncState | null {
  try {
    const state = JSON.parse(readFileSync(stateFile(dir), "utf8")) as SyncState;
    return state?.format === 1 && state.siteId && state.files ? state : null;
  } catch {
    return null;
  }
}

/** Like `readState`, but a folder that was never pulled is an error with the next step in it. */
export function requireState(dir: string): SyncState {
  const state = readState(dir);
  if (!state) throw new Error(`${dir} isn't a pulled site (no ${STATE_DIR}/state.json). Run \`pagehub pull <siteId> ${dir}\` first.`);
  return state;
}

export function writeState(dir: string, state: SyncState): void {
  const file = stateFile(dir);
  mkdirSync(dirname(file), { recursive: true });
  const ignore = join(dir, STATE_DIR, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, file);
}

/**
 * The absolute path of `path` under `dir`, or a throw when it would land outside it (`../`, an absolute path) or run
 * through a symlink. A path comes from the server, so it is never trusted to stay inside the folder.
 */
export function safeAt(dir: string, path: string): string {
  const root = resolve(dir);
  const abs = resolve(root, path);
  if (abs === root || !abs.startsWith(root + sep)) throw new Error(`Refusing a path outside the folder: ${path}`);
  let at = root;
  for (const part of relative(root, abs).split(sep)) {
    at = join(at, part);
    let link = false;
    try {
      link = lstatSync(at).isSymbolicLink();
    } catch {
      break; // the rest does not exist yet
    }
    if (link) throw new Error(`Refusing to write through a symlink: ${path}`);
  }
  return abs;
}

/** Write a file under a folder, creating the folders on the way. */
export function writeAt(dir: string, path: string, text: string): void {
  const abs = safeAt(dir, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

export const readAt = (dir: string, path: string): string | undefined => {
  try {
    return readFileSync(join(dir, path), "utf8");
  } catch {
    return undefined;
  }
};

export const removeAt = (dir: string, path: string): void => rmSync(safeAt(dir, path), { force: true });

export const baseAt = (dir: string, path: string) => readAt(join(dir, STATE_DIR, "base"), path);
export const saveBase = (dir: string, path: string, text: string) => writeAt(join(dir, STATE_DIR, "base"), path, text);
export const dropBase = (dir: string, path: string) => removeAt(join(dir, STATE_DIR, "base"), path);
export const saveTheirs = (dir: string, path: string, text: string) => writeAt(join(dir, STATE_DIR, "theirs"), path, text);
export const clearTheirs = (dir: string, path: string) => removeAt(join(dir, STATE_DIR, "theirs"), path);
export const theirsPath = (path: string) => `${STATE_DIR}/theirs/${path}`;
export const basePath = (path: string) => `${STATE_DIR}/base/${path}`;
