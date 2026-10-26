/**
 * In-memory storage: a plain object of files. Versions count writes per file. `external`
 * simulates another writer (a teammate, a CLI) and notifies watchers.
 */
import { defineStorage, type StorageDef } from "./defineStorage";
import { assertUniqueEditIds, editIdsIn } from "../identity/editIds";
import type { Path } from "../state/changes";

export interface MemoryStorage extends StorageDef {
  /** Current stored texts. */
  snapshot(): Record<Path, string>;
  /** Write as someone else would (bumps the version, notifies watchers). */
  external(path: Path, text: string): void;
  /** Number of successful `write` / `writeBatch` calls (tests: a no-op save writes nothing; a batch counts once). */
  readonly writes: number;
}

export function memoryStorage(initial: Record<Path, string> = {}, opts: { id?: string } = {}): MemoryStorage {
  const files = new Map<Path, { text: string; version: number }>(Object.entries(initial).map(([p, text]) => [p, { text, version: 1 }]));
  const watchers = new Set<(path: Path) => void>();
  let writes = 0;
  const put = (path: Path, text: string) => {
    const v = (files.get(path)?.version ?? 0) + 1;
    files.set(path, { text, version: v });
    return String(v);
  };
  const base = defineStorage({
    id: opts.id ?? "memory",
    list: async () => [...files.keys()].sort(),
    read: async (path) => {
      const f = files.get(path);
      return f ? { text: f.text, version: String(f.version) } : null;
    },
    write: async (path, text, { baseVersion }) => {
      const f = files.get(path);
      const current = f ? String(f.version) : null;
      if (current !== baseVersion) return { ok: false, conflict: { theirs: f?.text ?? "", version: current ?? "" } };
      assertUniqueEditIds(path, text, [...files].filter(([p]) => p !== path).map(([, v]) => v.text));
      writes++;
      return { ok: true, version: put(path, text) };
    },
    writeBatch: async (changes, { baseVersions }) => {
      const conflicts: Array<{ path: Path; theirs: string; version: string }> = [];
      for (const c of changes) {
        const f = files.get(c.path);
        const current = f ? String(f.version) : null;
        if (current !== (baseVersions[c.path] ?? null)) conflicts.push({ path: c.path, theirs: f?.text ?? "", version: current ?? "" });
      }
      if (conflicts.length) return { ok: false, conflicts };
      const next = new Map([...files].map(([p, f]) => [p, f.text]));
      for (const c of changes) {
        if ("delete" in c) next.delete(c.path);
        else next.set(c.path, c.text);
      }
      for (const c of changes) if (!("delete" in c)) assertUniqueEditIds(c.path, c.text, [...next].filter(([p]) => p !== c.path).map(([, t]) => t));
      const versions: Record<Path, string> = {};
      for (const c of changes) {
        if ("delete" in c) files.delete(c.path);
        else versions[c.path] = put(c.path, c.text);
      }
      writes++;
      return { ok: true, versions };
    },
    watch: (fn) => {
      watchers.add(fn);
      return () => void watchers.delete(fn);
    },
    editIds: async (except) => new Set([...files].filter(([p]) => p !== except).flatMap(([, f]) => editIdsIn(f.text))),
  });
  return Object.defineProperties(base, {
    snapshot: { value: () => Object.fromEntries([...files].map(([p, f]) => [p, f.text])) },
    external: {
      value(path: Path, text: string) {
        put(path, text);
        for (const w of [...watchers]) w(path);
      },
    },
    writes: { get: () => writes },
  }) as MemoryStorage;
}
