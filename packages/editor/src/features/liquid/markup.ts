/**
 * Reading a Liquid tag's markup for the panels, and putting it back together: the panels
 * edit one part (the loop's list, the page size, the partial name) and write the whole
 * markup with `liquid.setMarkup`, which splices only the bytes that changed.
 */
import { type NodeHandle } from "@pagehub/engine";
import { branchTagRange, markupRange, openTagOf } from "@pagehub/engine/kits";

/** The markup of `h`'s open tag, or of its `branch`-th branch tag. */
export function markupOf(source: string, h: NodeHandle, branch = 0): string {
  if (!h.alive) return "";
  const n = h.node();
  const tag = branch ? (n.kind === "liquid-block" ? branchTagRange(source, n, branch) : null) : openTagOf(n);
  if (!tag) return "";
  const r = markupRange(source, tag);
  return source.slice(r.from, r.to);
}

/** Branch names of a Liquid block in order (`main` / `body`, `elsif`, `when`, `else`). */
export function branchNames(h: NodeHandle): string[] {
  if (!h.alive) return [];
  const n = h.node();
  return n.kind === "liquid-block" ? n.branches.map((b) => b.name) : [];
}

interface ForParts {
  item: string;
  collection: string;
  reversed: boolean;
  /** Everything after the head (`, limit: 3 offset: 1`), kept as written. */
  tail: string;
}

const FOR_HEAD = /^([a-z_][\w]*)\s+in\s+(\([^)]*\)|[^\s,]+)(\s+reversed\b)?/i;

export function parseFor(markup: string): ForParts | null {
  const m = FOR_HEAD.exec(markup.trim());
  if (!m) return null;
  return { item: m[1]!, collection: m[2]!, reversed: !!m[3], tail: markup.trim().slice(m[0].length) };
}

export const buildFor = (p: ForParts): string => `${p.item} in ${p.collection}${p.reversed ? " reversed" : ""}${p.tail}`;

interface PaginateParts {
  list: string;
  by: string;
  tail: string;
}

const PAGINATE = /^(\S+)\s+by\s+(\S+?)(?=,|\s|$)/i;

export function parsePaginate(markup: string): PaginateParts | null {
  const m = PAGINATE.exec(markup.trim());
  return m ? { list: m[1]!, by: m[2]!, tail: markup.trim().slice(m[0].length) } : null;
}

export const buildPaginate = (p: PaginateParts): string => `${p.list} by ${p.by}${p.tail}`;

/** A tag whose markup starts with a quoted name (`form`, `render`, `section`). */
interface NamedParts {
  name: string;
  tail: string;
}

export function parseNamed(markup: string): NamedParts | null {
  const m = /^(['"])([^'"]*)\1/.exec(markup.trim());
  return m ? { name: m[2]!, tail: markup.trim().slice(m[0].length) } : null;
}

/** `'name'` + the rest; the name is a Liquid string (no quotes inside it). */
export function buildNamed(p: NamedParts): string | null {
  if (/['"]/.test(p.name) || !p.name.trim()) return null;
  return `'${p.name.trim()}'${p.tail}`;
}

const isBlank = (h: NodeHandle) => h.kind === "text" && !h.text().trim();

/**
 * The block that only wraps `h` ("Show only when…" / "Repeat for each…"): its parent, when
 * that is a single-branch `tags` block whose one non-blank child is `h`.
 */
export function wrapperOf(h: NodeHandle | null, tags: readonly string[]): NodeHandle | null {
  const p = h?.alive ? h.parent() : null;
  if (!p || p.kind !== "liquid-block" || !tags.includes(p.tag) || branchNames(p).length !== 1) return null;
  const kids = p.children().filter((c) => !isBlank(c));
  return kids.length === 1 && kids[0] === h ? p : null;
}

/** Inspector rows whose form is a Liquid wrapper around the element ("Show only when…" / "Repeat for each…"). */
export const WRAPPER_ROWS: Readonly<Record<string, readonly string[]>> = { conditions: ["if", "unless"], dataSource: ["for"] };
