/**
 * File-system storage (Node only; export `./fs`). Paths are POSIX, relative to `root`;
 * version = mtime + size + sha256 prefix. Writes go to a temp file then rename, after
 * checking the base version (a stale version → conflict, nothing overwritten).
 */
import { promises as fsp, watch as fsWatch } from "node:fs";
import { createHash } from "node:crypto";
import nodePath from "node:path";
import { defineStorage, type StorageDef } from "./defineStorage";
import { assertUniqueEditIds, editIdsIn } from "../identity/editIds";
import type { Path } from "../state/changes";

export interface FsStorageOptions {
  root: string;
  /** Which files are site files (default: .liquid .html .json .css .js .svg .txt .md, no dot-dirs, no node_modules). */
  include?: (path: Path) => boolean;
}

const DEFAULT_EXT = /\.(liquid|html|json|css|js|svg|txt|md)$/;
const defaultInclude = (p: Path) => DEFAULT_EXT.test(p) && !p.split("/").some((s) => s.startsWith(".") || s === "node_modules");

const versionOf = (text: string, stat: { mtimeMs: number; size: number }) =>
  `${Math.floor(stat.mtimeMs)}-${stat.size}-${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;

export function fsStorage(opts: FsStorageOptions): StorageDef {
  const root = nodePath.resolve(opts.root);
  const include = opts.include ?? defaultInclude;
  const abs = (p: Path) => {
    const full = nodePath.resolve(root, p);
    if (!full.startsWith(root + nodePath.sep)) throw new Error(`path escapes the site root: ${p}`);
    return full;
  };
  const list = async (): Promise<Path[]> => {
    const entries = await fsp.readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => nodePath.relative(root, nodePath.join(e.parentPath, e.name)).split(nodePath.sep).join("/"))
      .filter(include)
      .sort();
  };
  const read = async (path: Path) => {
    try {
      const text = await fsp.readFile(abs(path), "utf8");
      return { text, version: versionOf(text, await fsp.stat(abs(path))) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  };
  return defineStorage({
    id: `fs:${root}`,
    list,
    read,
    async write(path, text, { baseVersion }) {
      const current = await read(path);
      if ((current?.version ?? null) !== baseVersion) return { ok: false, conflict: { theirs: current?.text ?? "", version: current?.version ?? "" } };
      if (text.includes("data-edit-id")) {
        const others = await Promise.all((await list()).filter((p) => p !== path).map(async (p) => (await read(p))?.text ?? ""));
        assertUniqueEditIds(path, text, others);
      }
      const file = abs(path);
      await fsp.mkdir(nodePath.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fsp.writeFile(tmp, text, "utf8");
      await fsp.rename(tmp, file);
      return { ok: true, version: versionOf(text, await fsp.stat(file)) };
    },
    async writeBatch(changes, { baseVersions }) {
      const current = new Map<Path, Awaited<ReturnType<typeof read>>>();
      const conflicts: Array<{ path: Path; theirs: string; version: string }> = [];
      for (const c of changes) {
        const have = await read(c.path);
        current.set(c.path, have);
        if ((have?.version ?? null) !== (baseVersions[c.path] ?? null)) conflicts.push({ path: c.path, theirs: have?.text ?? "", version: have?.version ?? "" });
      }
      if (conflicts.length) return { ok: false, conflicts };
      const writes = changes.filter((c): c is { path: Path; text: string } => "text" in c);
      if (writes.some((c) => c.text.includes("data-edit-id"))) {
        const touched = new Set(changes.map((c) => c.path));
        const untouched = await Promise.all((await list()).filter((p) => !touched.has(p)).map(async (p) => (await read(p))?.text ?? ""));
        for (const c of writes) assertUniqueEditIds(c.path, c.text, [...untouched, ...writes.filter((o) => o !== c).map((o) => o.text)]);
      }
      // Stage every file beside its target, then rename them all; a failure part-way puts the originals back.
      const stamp = `${process.pid}.${Date.now()}.tmp`;
      const staged: Array<{ path: Path; tmp: string }> = [];
      const done: Path[] = [];
      try {
        for (const c of writes) {
          const file = abs(c.path);
          await fsp.mkdir(nodePath.dirname(file), { recursive: true });
          const tmp = `${file}.${stamp}`;
          await fsp.writeFile(tmp, c.text, "utf8");
          staged.push({ path: c.path, tmp });
        }
        for (const c of changes) {
          if ("delete" in c) {
            await fsp.rm(abs(c.path), { force: true });
          } else {
            await fsp.rename(staged.find((s) => s.path === c.path)!.tmp, abs(c.path));
          }
          done.push(c.path);
        }
      } catch (e) {
        for (const s of staged) await fsp.rm(s.tmp, { force: true }).catch(() => {});
        for (const path of done) {
          const before = current.get(path);
          if (before) await fsp.writeFile(abs(path), before.text, "utf8").catch(() => {});
          else await fsp.rm(abs(path), { force: true }).catch(() => {});
        }
        throw e;
      }
      const versions: Record<Path, string> = {};
      for (const c of writes) versions[c.path] = versionOf(c.text, await fsp.stat(abs(c.path)));
      return { ok: true, versions };
    },
    watch(onChange) {
      const w = fsWatch(root, { recursive: true }, (_ev, name) => {
        if (!name) return;
        const p = String(name).split(nodePath.sep).join("/");
        if (include(p) && !p.endsWith(".tmp")) onChange(p);
      });
      return () => w.close();
    },
    async editIds(except) {
      const out = new Set<string>();
      for (const p of await list()) if (p !== except) for (const id of editIdsIn((await read(p))?.text ?? "")) out.add(id);
      return out;
    },
  });
}
