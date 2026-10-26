/**
 * Persisted identity (`identity: "persisted"`): `data-edit-id` on eligible
 * elements, unique per site, written only by `normalize` (on open and on every save).
 * `normalize(next, prev, opts)` reconciles ids so an element keeps its id across edits:
 * kept → same parent + tag + index as in `prev` → same tag + unique text fingerprint →
 * minted. Pasted ids that another file uses, and duplicates within the file, are reminted.
 * Idempotent: normalizing a normalized text returns it byte for byte.
 */
import MagicString from "magic-string";
import { EDIT_ATTRIBUTES, EDIT_ID_PATTERN } from "../attributes/editAttributes";
import { findAttribute } from "../edit/ops";
import { parseSource } from "../parse/parse";
import { buildTree, type ElementTreeNode, type TreeNode } from "../parse/tree";
import type { Environment } from "../parse/environment";
import type { Identity } from "./session";
import type { NodeHandle } from "../state/handles";

const ID = EDIT_ATTRIBUTES.id;

import { HTML_ID_ELEMENTS } from "../kits/html/idElements";

/** Elements that carry ids by default: the html kit's list (one source, `kits/html/idElements.ts`). */
export const DEFAULT_ID_ELEMENTS: ReadonlySet<string> = HTML_ID_ELEMENTS;

export interface NormalizeOptions {
  /** Every data-edit-id used in the site's OTHER files (StorageDef.editIds). Ids are site-unique. */
  taken: ReadonlySet<string>;
  /** Injected for tests; default crypto-random /^[a-z][a-z0-9]{5}$/. */
  mint?: () => string;
  idElements?: ReadonlySet<string>;
  env?: Environment;
}

export interface NormalizeResult {
  source: string;
  minted: string[];
  matched: Array<{ id: string; by: "kept" | "position" | "fingerprint" }>;
  reminted: Array<{ duplicate: string; id: string; reason: "duplicate-in-file" | "taken-elsewhere" }>;
  stripped: Array<{ id: string; reason: "ineligible" | "invalid" }>;
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz";
const ALNUM = ALPHA + "0123456789";

export function mintEditId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = ALPHA[bytes[0]! % 26]!;
  for (let i = 1; i < 6; i++) s += ALNUM[bytes[i]! % 36]!;
  return s;
}

/** Text fingerprint: outputs → `{{}}`, tags removed, whitespace collapsed, lower-cased, 200 chars. */
export function fingerprint(source: string): string {
  return source
    .replace(/\{\{[\s\S]*?\}\}/g, "\u0001")
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u0001/g, "{{}}")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

interface IdAttr {
  /** Whole attribute range (with leading whitespace for removal). */
  start: number;
  end: number;
  value: string | null;
  valueRange: { start: number; end: number } | null;
}

function idAttr(src: string, n: ElementTreeNode): IdAttr | null {
  const a = findAttribute(n.node, ID);
  if (!a) return null;
  let start = a.position.start;
  while (start > 0 && /\s/.test(src[start - 1]!)) start--;
  const vr = "attributePosition" in a ? { start: a.attributePosition.start, end: a.attributePosition.end } : null;
  return { start, end: a.position.end, value: vr ? src.slice(vr.start, vr.end) : null, valueRange: vr };
}

interface Visit {
  n: ElementTreeNode;
  eligible: boolean;
  /** Nearest eligible ancestor (null = root). */
  parent: Visit | null;
  index: number;
}

/** Elements in document order with eligibility, nearest eligible parent and index among its eligible children. */
function walk(src: string, nodes: TreeNode[], idElements: ReadonlySet<string>): Visit[] {
  const out: Visit[] = [];
  const counts = new Map<Visit | null, number>();
  const visit = (list: TreeNode[], parent: Visit | null, inSvg: boolean, inHead: boolean): void => {
    for (const n of list) {
      if (n.kind === "content") continue;
      if (n.kind === "liquid-block") {
        for (const b of n.branches) visit(b.children, parent, inSvg, inHead);
        continue;
      }
      const eligible = idElements.has(n.tag) && !inSvg && !inHead;
      const v: Visit = { n, eligible, parent, index: -1 };
      if (eligible) {
        v.index = counts.get(parent) ?? 0;
        counts.set(parent, v.index + 1);
      }
      out.push(v);
      visit(n.children, eligible ? v : parent, inSvg || n.tag === "svg", inHead || n.tag === "head");
    }
  };
  visit(nodes, null, false, false);
  return out;
}

export function normalize(next: string, prev: string | null, opts: NormalizeOptions): NormalizeResult {
  const idElements = opts.idElements ?? DEFAULT_ID_ELEMENTS;
  const mint = opts.mint ?? mintEditId;
  const result: NormalizeResult = { source: next, minted: [], matched: [], reminted: [], stripped: [] };
  const visits = walk(next, buildTree(parseSource(next, "strict", { env: opts.env })), idElements);

  // 2. index prev
  type Cand = { id: string; tag: string; parentId: string; index: number; fp: string };
  const candidates: Cand[] = [];
  if (prev !== null) {
    const pv = walk(prev, buildTree(parseSource(prev, "strict", { env: opts.env })), idElements);
    const prevId = new Map<Visit, string>();
    for (const v of pv) {
      if (!v.eligible) continue;
      const a = idAttr(prev, v.n);
      if (a?.value && EDIT_ID_PATTERN.test(a.value)) prevId.set(v, a.value);
    }
    for (const [v, id] of prevId) {
      const parentId = v.parent ? (prevId.get(v.parent) ?? "\u0000none") : "#root";
      candidates.push({ id, tag: v.n.tag, parentId, index: v.index, fp: fingerprint(prev.slice(v.n.range.start, v.n.range.end)) });
    }
  }

  // 3. ids present in next
  const present = new Set<string>();
  for (const v of visits) {
    const a = idAttr(next, v.n);
    if (a?.value && EDIT_ID_PATTERN.test(a.value)) present.add(a.value);
  }

  // 4. walk next
  const s = new MagicString(next);
  const claimed = new Set<string>();
  const assigned = new Map<Visit, string>();
  const available = candidates.filter((c) => !present.has(c.id));
  const take = (c: Cand) => available.splice(available.indexOf(c), 1);
  const fresh = (): string => {
    for (let i = 0; i < 1000; i++) {
      const id = mint();
      if (EDIT_ID_PATTERN.test(id) && !opts.taken.has(id) && !present.has(id) && !claimed.has(id)) return id;
    }
    throw new Error("could not mint a unique data-edit-id");
  };

  for (const v of visits) {
    const a = idAttr(next, v.n);
    if (!v.eligible) {
      if (a) {
        s.remove(a.start, a.end);
        result.stripped.push({ id: a.value ?? "", reason: "ineligible" });
      }
      continue;
    }
    let dup: { id: string; reason: "duplicate-in-file" | "taken-elsewhere" } | null = null;
    if (a) {
      if (a.value && EDIT_ID_PATTERN.test(a.value)) {
        if (opts.taken.has(a.value)) dup = { id: a.value, reason: "taken-elsewhere" };
        else if (claimed.has(a.value)) dup = { id: a.value, reason: "duplicate-in-file" };
        else {
          claimed.add(a.value);
          assigned.set(v, a.value);
          result.matched.push({ id: a.value, by: "kept" });
          continue;
        }
      } else result.stripped.push({ id: a.value ?? "", reason: "invalid" });
    }
    // no usable id: reconcile against prev
    const parentId = v.parent ? assigned.get(v.parent)! : "#root";
    let id: string;
    const pos = available.find((c) => c.parentId === parentId && c.tag === v.n.tag && c.index === v.index);
    const fp = fingerprint(next.slice(v.n.range.start, v.n.range.end));
    const byFp = fp ? available.filter((c) => c.tag === v.n.tag && c.fp === fp) : [];
    if (pos) {
      take(pos);
      id = pos.id;
      result.matched.push({ id, by: "position" });
    } else if (byFp.length === 1) {
      take(byFp[0]!);
      id = byFp[0]!.id;
      result.matched.push({ id, by: "fingerprint" });
    } else {
      id = fresh();
      result.minted.push(id);
    }
    claimed.add(id);
    assigned.set(v, id);
    if (dup) result.reminted.push({ duplicate: dup.id, id, reason: dup.reason });
    if (a?.valueRange && a.value !== null) s.overwrite(a.valueRange.start, a.valueRange.end, id);
    else if (a) s.overwrite(a.start, a.end, ` ${ID}="${id}"`);
    else {
      const last = v.n.attributes.at(-1);
      s.appendLeft(last ? last.range.end : v.n.openTag.start + 1 + v.n.tag.length, ` ${ID}="${id}"`);
    }
  }
  result.source = s.hasChanged() ? s.toString() : next;
  return result;
}

/** `handle.id()` reads the element's `data-edit-id`. */
export const persistedIdentity: Identity = {
  mode: "persisted",
  id(h: NodeHandle): string | null {
    if (!h.alive || h.kind !== "element") return null;
    const v = h.attr(ID);
    return v && EDIT_ID_PATTERN.test(v) ? v : null;
  },
};
