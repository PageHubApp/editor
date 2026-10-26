/**
 * Change sets over many files. A `ChangeSet` holds `Change { path, from, to, insert }`
 * entries that all refer to the SAME base files (simultaneous, non-overlapping per file).
 * It applies, inverts, composes, maps positions and rebases — the substrate for
 * transactions, handles, history and remote edits. The edit ops produce its splices.
 */
import { sortSplices, type Splice } from "../edit/ops";

/** POSIX, site-relative ("pages/index.liquid"). */
export type Path = string;

export interface Change {
  path: Path;
  from: number;
  to: number;
  insert: string;
}

export type Files = ReadonlyMap<Path, string>;

/**
 * Map a position through splices. A pure insertion at `pos` lands before it with
 * `assoc: -1`, after it with `1`; a position inside a replaced range collapses to the
 * range's start (`-1`) or end (`1`); a range's own start and end stay on its edges.
 */
export function mapPos(splices: readonly Splice[], pos: number, assoc: -1 | 1 = -1): number {
  let delta = 0;
  for (const c of splices) {
    if (c.from > pos) break;
    if (c.from === c.to) {
      if (c.from === pos && assoc < 0) break;
      delta += c.insert.length;
      continue;
    }
    if (pos === c.from) return pos + delta;
    if (pos < c.to) return c.from + delta + (assoc < 0 ? 0 : c.insert.length);
    delta += c.insert.length - (c.to - c.from);
  }
  return pos + delta;
}

/**
 * Map a node's range. Null when a deletion swallows it whole; an exact replacement of the
 * range keeps it (as the replacement); otherwise start sticks right, end sticks left.
 */
export function mapRange(splices: readonly Splice[], from: number, to: number): { from: number; to: number } | null {
  let delta = 0;
  for (const c of splices) {
    if (c.from > from) break;
    if (c.from === from && c.to === to && to > from && c.insert) return { from: c.from + delta, to: c.from + delta + c.insert.length };
    if (c.to > c.from && c.from <= from && c.to >= to) return null;
    delta += c.insert.length - (c.to - c.from);
  }
  const a = mapPos(splices, from, 1);
  const b = mapPos(splices, to, -1);
  return b > a || (b === a && to === from) ? { from: a, to: b } : null;
}

/** Inverse splices of `splices` applied to `base`, in the coordinates of the result. */
export function invertSplices(splices: readonly Splice[], base: string): Splice[] {
  let delta = 0;
  return splices.map((c) => {
    const from = c.from + delta;
    delta += c.insert.length - (c.to - c.from);
    return { from, to: from + c.insert.length, insert: base.slice(c.from, c.to) };
  });
}

type Atom = { r: number } | { d: number } | { i: string };

function toAtoms(splices: readonly Splice[]): Atom[] {
  const out: Atom[] = [];
  let pos = 0;
  for (const c of splices) {
    if (c.from > pos) out.push({ r: c.from - pos });
    if (c.to > c.from) out.push({ d: c.to - c.from });
    if (c.insert) out.push({ i: c.insert });
    pos = c.to;
  }
  return out;
}

function fromAtoms(atoms: Atom[]): Splice[] {
  const out: Splice[] = [];
  let pos = 0;
  let cur: Splice | null = null;
  for (const a of atoms) {
    if ("r" in a) {
      if (cur) out.push(cur), (cur = null);
      pos += a.r;
    } else if ("d" in a) {
      cur ??= { from: pos, to: pos, insert: "" };
      cur.to += a.d;
      pos += a.d;
    } else {
      cur ??= { from: pos, to: pos, insert: "" };
      cur.insert += a.i;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const atomLen = (a: Atom): number => ("r" in a ? a.r : "d" in a ? a.d : a.i.length);
const shorten = (a: Atom, n: number): Atom => ("r" in a ? { r: a.r - n } : "d" in a ? { d: a.d - n } : { i: a.i.slice(n) });

/** Splices equivalent to applying `a` then `b` (`b` in `a`'s output coordinates). */
export function composeSplices(a: readonly Splice[], b: readonly Splice[]): Splice[] {
  const A = toAtoms(a);
  const B = toAtoms(b);
  const out: Atom[] = [];
  let x: Atom | undefined = A.shift();
  let y: Atom | undefined = B.shift();
  while (x || y) {
    if (y && "i" in y) { out.push(y); y = B.shift(); continue; }
    if (x && "d" in x) { out.push(x); x = A.shift(); continue; }
    if (!x) { out.push(y!); y = B.shift(); continue; }
    if (!y) { out.push(x); x = A.shift(); continue; }
    const n = Math.min(atomLen(x), atomLen(y));
    if ("r" in x) out.push("r" in y ? { r: n } : { d: n });
    else if ("r" in y) out.push({ i: x.i.slice(0, n) });
    x = atomLen(x) === n ? A.shift() : shorten(x, n);
    y = atomLen(y) === n ? B.shift() : shorten(y, n);
  }
  return fromAtoms(out);
}

/** Rebase `a` onto `b` (both on the same base): the result applies after `b`. */
export function rebaseSplices(a: readonly Splice[], b: readonly Splice[]): Splice[] {
  const out: Splice[] = [];
  for (const c of a) {
    const from = mapPos(b, c.from, 1);
    const to = Math.max(from, mapPos(b, c.to, -1));
    const prev = out.at(-1);
    if (prev && from < prev.to) continue; // swallowed by a concurrent change
    out.push({ from, to, insert: c.insert });
  }
  return out;
}

export class ChangeSet {
  static readonly empty = new ChangeSet(new Map());

  private constructor(private readonly byPath: ReadonlyMap<Path, readonly Splice[]>) {}

  /** Build from changes that all refer to the same base files. Overlaps throw. */
  static of(changes: readonly Change[]): ChangeSet {
    const groups = new Map<Path, Splice[]>();
    for (const c of changes) {
      if (c.from > c.to || c.from < 0) throw new RangeError(`bad change range ${c.from}-${c.to} in ${c.path}`);
      if (c.from === c.to && !c.insert) continue;
      const list = groups.get(c.path) ?? [];
      list.push({ from: c.from, to: c.to, insert: c.insert });
      groups.set(c.path, list);
    }
    return ChangeSet.fromSplices(groups);
  }

  /** Splices for one file. */
  static ofFile(path: Path, splices: readonly Splice[]): ChangeSet {
    return ChangeSet.of(splices.map((s) => ({ path, ...s })));
  }

  private static fromSplices(groups: ReadonlyMap<Path, readonly Splice[]>): ChangeSet {
    const out = new Map<Path, readonly Splice[]>();
    for (const [path, list] of groups) if (list.length) out.set(path, sortSplices(list));
    return out.size ? new ChangeSet(out) : ChangeSet.empty;
  }

  get empty(): boolean {
    return this.byPath.size === 0;
  }

  get paths(): Path[] {
    return [...this.byPath.keys()];
  }

  get changes(): readonly Change[] {
    return [...this.byPath].flatMap(([path, list]) => list.map((s) => ({ path, ...s })));
  }

  splices(path: Path): readonly Splice[] {
    return this.byPath.get(path) ?? [];
  }

  map(pos: number, path: Path, assoc: -1 | 1 = -1): number {
    return mapPos(this.splices(path), pos, assoc);
  }

  mapRange(path: Path, from: number, to: number): { from: number; to: number } | null {
    return mapRange(this.splices(path), from, to);
  }

  /** New files with the changes applied; a change to a missing file creates it from "". */
  apply(files: Files): Map<Path, string> {
    const out = new Map(files);
    for (const [path, list] of this.byPath) {
      const text = files.get(path) ?? "";
      let next = "";
      let pos = 0;
      for (const s of list) {
        if (s.to > text.length) throw new RangeError(`change ${s.from}-${s.to} is past the end of ${path}`);
        next += text.slice(pos, s.from) + s.insert;
        pos = s.to;
      }
      out.set(path, next + text.slice(pos));
    }
    return out;
  }

  /** The change set that undoes this one, given the files it was applied to. */
  invert(base: Files | { files: Files }): ChangeSet {
    const files = base instanceof Map ? base : (base as { files: Files }).files;
    const out = new Map<Path, Splice[]>();
    for (const [path, list] of this.byPath) out.set(path, invertSplices(list, files.get(path) ?? ""));
    return ChangeSet.fromSplices(out);
  }

  /** This change set followed by `other` (which is in this one's output coordinates). */
  compose(other: ChangeSet): ChangeSet {
    const out = new Map<Path, Splice[]>();
    for (const path of new Set([...this.paths, ...other.paths])) out.set(path, composeSplices(this.splices(path), other.splices(path)));
    return ChangeSet.fromSplices(out);
  }

  /** This change set rebased onto `other` (same base): the result applies after `other`. */
  rebase(other: ChangeSet): ChangeSet {
    const out = new Map<Path, Splice[]>();
    for (const path of this.paths) out.set(path, rebaseSplices(this.splices(path), other.splices(path)));
    return ChangeSet.fromSplices(out);
  }
}
