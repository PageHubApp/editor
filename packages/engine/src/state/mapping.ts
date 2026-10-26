/**
 * A transaction's position mapping: the steps it was built from, in order. Each step is a
 * change set plus the nodes it relocated (a move cuts a node out and splices it in
 * elsewhere, so offset arithmetic alone can't follow it). Handles and offsets map through
 * every step; the inverted mapping maps back (undo).
 */
import { ChangeSet, mapPos, invertSplices, type Path } from "./changes";
import type { Splice } from "../edit/ops";

/** A node cut from `[from, to)` and re-inserted at `[newFrom, newTo)` (output coordinates), re-indented by `inner`. */
export interface Relocation {
  path: Path;
  from: number;
  to: number;
  newFrom: number;
  newTo: number;
  /** Splices from the node's old text to its new text (offsets relative to the node). */
  inner: readonly Splice[];
  /** Splices from the new text back to the old one. */
  innerInverse: readonly Splice[];
}

export interface MapStep {
  changes: ChangeSet;
  inverse: ChangeSet;
  relocations: readonly Relocation[];
}

export function relocation(path: Path, from: number, oldText: string, newFrom: number, newText: string, inner: readonly Splice[]): Relocation {
  return { path, from, to: from + oldText.length, newFrom, newTo: newFrom + newText.length, inner, innerInverse: invertSplices(inner, oldText) };
}

const invertRelocation = (r: Relocation): Relocation => ({
  path: r.path,
  from: r.newFrom,
  to: r.newTo,
  newFrom: r.from,
  newTo: r.to,
  inner: r.innerInverse,
  innerInverse: r.inner,
});

export class Mapping {
  static readonly empty = new Mapping([]);

  constructor(readonly steps: readonly MapStep[]) {}

  /** A mapping with a single plain step. */
  static of(changes: ChangeSet, inverse: ChangeSet): Mapping {
    return changes.empty ? Mapping.empty : new Mapping([{ changes, inverse, relocations: [] }]);
  }

  map(pos: number, path: Path, assoc: -1 | 1 = -1): number {
    for (const step of this.steps) {
      const r = step.relocations.find((r) => r.path === path && pos >= r.from && pos <= r.to);
      pos = r ? r.newFrom + mapPos(r.inner, pos - r.from, assoc) : step.changes.map(pos, path, assoc);
    }
    return pos;
  }

  /** Map a node range; null once the node is gone. */
  mapRange(path: Path, from: number, to: number): { from: number; to: number } | null {
    let range: { from: number; to: number } | null = { from, to };
    for (const step of this.steps) {
      const { from: a, to: b }: { from: number; to: number } = range!;
      const r: Relocation | undefined = step.relocations.find((r) => r.path === path && a >= r.from && b <= r.to);
      range = r
        ? { from: r.newFrom + mapPos(r.inner, a - r.from, 1), to: r.newFrom + mapPos(r.inner, b - r.from, -1) }
        : step.changes.mapRange(path, a, b);
      if (!range) return null;
    }
    return range;
  }

  concat(other: Mapping): Mapping {
    return other.steps.length ? (this.steps.length ? new Mapping([...this.steps, ...other.steps]) : other) : this;
  }

  invert(): Mapping {
    return new Mapping(
      [...this.steps].reverse().map((s) => ({ changes: s.inverse, inverse: s.changes, relocations: s.relocations.map(invertRelocation) })),
    );
  }
}
