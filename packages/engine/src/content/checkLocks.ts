/**
 * Lock check for writers that don't go through the editor's commands (a file write from MCP, the API or an AI agent).
 *
 * The editor refuses, per `data-edit-lock` (`delete`, `drag`, `move-out`, `drop-in`, or `sealed` for all four):
 * delete / cut / copy of an element locked `delete`; drag of one locked `drag`; dragging a child out of a parent
 * locked `move-out`. `checkLockChanges` holds a whole-site `prev` → `next` diff to the three rules a diff can show:
 *
 * - removed:  an element locked `delete` (or `sealed`) is gone. Removing a locked element along with an ancestor
 *             counts too — the file write has no "delete this node" intent to tell the two apart.
 * - unlocked: fewer elements carry a `delete` / `drag` / `move-out` lock than before (the lock was cleared, which
 *             would be the way round the two other rules). Unlock in the editor.
 * - moved:    an element locked `drag` sits under a different parent, or a child of a `move-out` parent now lives
 *             elsewhere (it left, and the site holds as many of that child as before).
 *
 * `drop-in` (adding children to a locked target) is not checked: a file write adds children by editing text, and
 * the editor's own insert paths already honour it.
 *
 * Elements have no identity across a file write unless they carry `data-edit-id` (the app's editor does not
 * persist ids), so matching is by tag + `data-edit-id` in document order. That is deliberately conservative: it can
 * refuse a legitimate write that happens to look like a removal, never let a plain removal through.
 * The editor's own saves are not checked (it enforces locks itself, and an unlock + delete in one autosave is fine).
 */
import { findAttribute } from "../edit/ops";
import { parseSource } from "../parse/parse";
import { buildTree, type ElementTreeNode, type TreeNode } from "../parse/tree";
import { EDIT_ATTRIBUTES, LOCK_WORDS } from "../attributes/editAttributes";
import { fingerprint } from "../identity/persisted";
import type { Environment } from "../parse/environment";
import type { Files, Path } from "../state/changes";

export type LockCheck = { ok: true } | { ok: false; reason: string; path: Path; element: string };

export interface LockCheckOptions {
  env?: Environment;
}

type Word = "delete" | "drag" | "move-out";
const WORDS: readonly Word[] = ["delete", "drag", "move-out"];

interface Entry {
  tag: string;
  id: string;
  /** `tag|id`: the match key. */
  key: string;
  locks: ReadonlySet<string>;
  /** Parent element's `tag|id`, `#root` at the top level. */
  parent: string;
  /** Direct element children, as `tag|id|fingerprint`. */
  children: string[];
  /** `tag|id|fingerprint`: what this element is as somebody's child. */
  childKey: string;
  label: string;
}

const attr = (src: string, el: ElementTreeNode, name: string): string | undefined => {
  const a = findAttribute(el.node, name);
  return a && "attributePosition" in a ? src.slice(a.attributePosition.start, a.attributePosition.end) : undefined;
};

const lockSet = (value: string | undefined): ReadonlySet<string> => new Set((value ?? "").split(/\s+/).filter((w) => (LOCK_WORDS as readonly string[]).includes(w) || w === "sealed"));
const has = (e: Entry, w: Word): boolean => e.locks.has(w) || e.locks.has("sealed");

function entriesOf(src: string, env?: Environment): Entry[] {
  const out: Entry[] = [];
  const visit = (nodes: TreeNode[], parent: Entry | null): string[] => {
    const kids: string[] = [];
    for (const n of nodes) {
      if (n.kind === "content") continue;
      if (n.kind === "liquid-block") {
        for (const b of n.branches) kids.push(...visit(b.children, parent));
        continue;
      }
      const id = attr(src, n, EDIT_ATTRIBUTES.id) ?? "";
      const lock = attr(src, n, EDIT_ATTRIBUTES.lock);
      const e: Entry = {
        tag: n.tag,
        id,
        key: `${n.tag}|${id}`,
        locks: lockSet(lock),
        parent: parent?.key ?? "#root",
        children: [],
        childKey: `${n.tag}|${id}|${fingerprint(src.slice(n.range.start, n.range.end))}`,
        label: `<${n.tag}${id ? ` ${EDIT_ATTRIBUTES.id}="${id}"` : attr(src, n, EDIT_ATTRIBUTES.name) ? ` ${EDIT_ATTRIBUTES.name}="${attr(src, n, EDIT_ATTRIBUTES.name)}"` : ""}>`,
      };
      out.push(e);
      kids.push(e.childKey);
      e.children = visit(n.children, e);
    }
    return kids;
  };
  visit(buildTree(parseSource(src, "strict", { env })), null);
  return out;
}

const tally = (list: readonly string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const k of list) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

const describe = (e: Entry): string => {
  const words = [...e.locks].join(" ");
  return `${e.label} is locked (data-edit-lock="${words}")`;
};

/** Null when `next` keeps every lock-protected element in `prev` in place. */
export function checkLockChanges(prev: Files | Record<Path, string>, next: Files | Record<Path, string>, opts: LockCheckOptions = {}): LockCheck {
  const p = prev instanceof Map ? prev : new Map(Object.entries(prev));
  const n = next instanceof Map ? next : new Map(Object.entries(next));
  const refuse = (path: Path, e: Entry, what: string): LockCheck => ({
    ok: false,
    path,
    element: e.label,
    reason: `${path}: ${describe(e)} and ${what}. Remove the lock in the editor first if this change is intended.`,
  });

  const nextEntries = new Map<Path, Entry[] | null>();
  const entriesFor = (path: Path): Entry[] | null => {
    if (!nextEntries.has(path)) {
      const text = n.get(path);
      let list: Entry[] | null = null;
      if (text !== undefined && path.endsWith(".liquid")) {
        try {
          list = entriesOf(text, opts.env);
        } catch {
          list = null;
        }
      } else if (text === undefined) list = [];
      nextEntries.set(path, list);
    }
    return nextEntries.get(path)!;
  };

  let nextCounts: Map<string, number> | null = null;
  const nextSiteChildren = (): Map<string, number> => (nextCounts ??= tally([...n.keys()].flatMap((path) => (entriesFor(path) ?? []).map((e) => e.childKey))));
  let prevCounts: Map<string, number> | null = null;
  const prevSiteChildren = (): Map<string, number> =>
    (prevCounts ??= tally([...p].flatMap(([path, text]) => (path.endsWith(".liquid") ? safeEntries(text, opts.env).map((e) => e.childKey) : []))));

  for (const [path, before] of p) {
    if (!path.endsWith(".liquid") || !before.includes(EDIT_ATTRIBUTES.lock)) continue;
    if (before === n.get(path)) continue;
    let was: Entry[];
    try {
      was = entriesOf(before, opts.env);
    } catch {
      continue;
    }
    if (!was.some((e) => e.locks.size)) continue;
    const now = entriesFor(path);
    if (!now) continue;

    // Removed or unlocked: fewer elements per key carry each lock than before.
    for (const w of WORDS) {
      const had = was.filter((e) => has(e, w));
      const kept = tally(now.filter((e) => has(e, w)).map((e) => e.key));
      const seen = new Map<string, number>();
      for (const e of had) {
        const i = (seen.get(e.key) ?? 0) + 1;
        seen.set(e.key, i);
        if (i > (kept.get(e.key) ?? 0)) return refuse(path, e, w === "delete" ? "can't be removed or unlocked by a file write" : `its ${w} lock can't be cleared by a file write`);
      }
    }

    // Moved: a `drag`-locked element under a new parent.
    for (const e of was) {
      if (!has(e, "drag")) continue;
      const there = now.filter((x) => x.key === e.key && has(x, "drag"))[was.filter((x) => x.key === e.key && has(x, "drag")).indexOf(e)];
      if (there && there.parent !== e.parent) return refuse(path, e, "can't be moved to another parent by a file write");
    }

    // Moved out: a child of a `move-out` parent that left it while the site still holds it.
    for (const e of was) {
      if (!has(e, "move-out")) continue;
      const peers = was.filter((x) => x.key === e.key && has(x, "move-out"));
      const there = now.filter((x) => x.key === e.key && has(x, "move-out"))[peers.indexOf(e)];
      if (!there) continue;
      const stillThere = tally(there.children);
      const seen = new Map<string, number>();
      for (const child of e.children) {
        const i = (seen.get(child) ?? 0) + 1;
        seen.set(child, i);
        if (i <= (stillThere.get(child) ?? 0)) continue;
        if ((nextSiteChildren().get(child) ?? 0) >= (prevSiteChildren().get(child) ?? 0)) return refuse(path, e, `a child (${child.split("|").slice(0, 2).filter(Boolean).join(" ")}) can't be moved out of it by a file write`);
      }
    }
  }
  return { ok: true };
}

function safeEntries(text: string, env?: Environment): Entry[] {
  try {
    return entriesOf(text, env);
  } catch {
    return [];
  }
}
