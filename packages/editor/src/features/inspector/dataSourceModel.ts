/**
 * The data-source model behind `DataSourcePanel`, mapped onto the HTML-first document.
 *
 * A bound element is wrapped in `{% for <item> in <collection> %}`. The collection, the item
 * name, the limit / offset / reversed arguments and the empty (`{% else %}`) branch all live on
 * that one for block. Filtering and sorting can't ride on the for tag — liquidjs's for-tag
 * ignores filters in the collection expression — so when the author adds a filter / sort / split
 * the panel manages a sibling `{% assign <var> = <base> | <filters…> %}` placed immediately before
 * the loop and points the loop at `<var>`. With no filters there is no assign and the loop reads
 * the base collection directly. Everything renders through the real Liquid runtime.
 */
import type { NodeHandle } from "@pagehub/engine";
import { parseFor } from "../liquid/markup";

export interface WhereClause {
  prop: string;
  value: string;
}

/** The parsed data source of a `{% for %}` wrapper. */
export interface DataSource {
  item: string;
  /** The underlying collection expression (before any filters). */
  base: string;
  where: WhereClause[];
  sort: string;
  split: string;
  reversed: boolean;
  limit: string;
  offset: string;
  /** The managed `{% assign %}` sibling, when filters are present. */
  assign: NodeHandle | null;
  /** The variable the assign defines / the loop reads (when managed). */
  var: string | null;
  /** Rows narrowed by a URL query parameter (the refetch-on-filter form): one `{% if %}{% assign %}{% endif %}` each. */
  urlFilters: UrlFilter[];
  /** The `{% paginate %}` block around the loop, when the list is paged. */
  paginate: NodeHandle | null;
  /** Where new siblings go before: the paginate block when there is one, else the loop. */
  anchor: NodeHandle;
}

/** A URL-driven filter: `?<param>=x` keeps the rows whose `<field>` equals x. */
export interface UrlFilter {
  param: string;
  field: string;
  handle: NodeHandle;
}

const ASSIGN = /^\{%-?\s*assign\s+([a-z_]\w*)\s*=\s*([\s\S]*?)\s*-?%\}$/i;
const isBlank = (h: NodeHandle) => h.kind === "text" && !h.text().trim();

const URL_FILTER = /^\{%-?\s*if\s+request\.query\.(\w+)\s+and\s+request\.query\.\1\s*!=\s*''\s*-?%\}\s*\{%-?\s*assign\s+([a-z_]\w*)\s*=\s*\2\s*\|\s*where:\s*(['"])([\w.]+)\3\s*,\s*request\.query\.\1\s*-?%\}\s*\{%-?\s*endif\s*-?%\}$/i;

/** The handle new sibling markup goes before: the `{% paginate %}` block when the loop is its first child, else the loop. */
export function anchorOf(wrapper: NodeHandle): NodeHandle {
  const p = wrapper.alive ? wrapper.parent() : null;
  if (p && p.kind === "liquid-block" && p.tag === "paginate" && p.children().find((c) => !isBlank(c)) === wrapper) return p;
  return wrapper;
}

/** The managed `{% assign %}` before the loop (past its URL-filter `{% if %}`s) whose var the loop reads. */
function managedAssign(wrapper: NodeHandle, collection: string): { handle: NodeHandle; rhs: string; var: string; urlFilters: UrlFilter[] } | null {
  const anchor = anchorOf(wrapper);
  const parent = anchor.alive ? anchor.parent() : null;
  if (!parent) return null;
  const kids = parent.children();
  const i = kids.indexOf(anchor);
  if (i < 0) return null;
  const urlFilters: UrlFilter[] = [];
  for (let j = i - 1; j >= 0; j--) {
    const sib = kids[j]!;
    if (isBlank(sib)) continue;
    if (sib.kind === "liquid-block" && sib.tag === "if") {
      const f = URL_FILTER.exec(sib.text().trim());
      if (f && f[2] === collection.trim()) {
        urlFilters.unshift({ param: f[1]!, field: f[4]!, handle: sib });
        continue;
      }
      return null;
    }
    if (sib.kind !== "liquid-tag" || sib.tag !== "assign") return null;
    const m = ASSIGN.exec(sib.text().trim());
    if (m && m[1] === collection.trim()) return { handle: sib, rhs: m[2]!.trim(), var: m[1]!, urlFilters };
    return null;
  }
  return null;
}

/** Split a filter pipeline RHS into its base and filter segments (top-level `|` only). */
function splitPipeline(rhs: string): { base: string; filters: string[] } {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let k = 0; k < rhs.length; k++) {
    const c = rhs[k]!;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "|" && depth === 0) {
      parts.push(rhs.slice(start, k));
      start = k + 1;
    }
  }
  parts.push(rhs.slice(start));
  return { base: parts[0]!.trim(), filters: parts.slice(1).map((p) => p.trim()).filter(Boolean) };
}

const WHERE = /^where\s*:\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3$/i;
const SORT = /^sort\s*:\s*(['"])(.*?)\1$/i;
const SPLIT = /^split\s*:\s*(['"])(.*?)\1$/i;

function parseFilters(filters: string[]): Pick<DataSource, "where" | "sort" | "split"> {
  const where: WhereClause[] = [];
  let sort = "";
  let split = "";
  for (const f of filters) {
    const w = WHERE.exec(f);
    if (w) {
      where.push({ prop: w[2]!, value: w[4]! });
      continue;
    }
    const s = SORT.exec(f);
    if (s) {
      sort = s[2]!;
      continue;
    }
    const sp = SPLIT.exec(f);
    if (sp) split = sp[2]!;
  }
  return { where, sort, split };
}

/** The inner markup of a `{% for … %}` open tag (`item in collection reversed limit: n …`). */
export function forInner(wrapper: NodeHandle): string {
  const m = /\{%-?\s*for\s+([\s\S]*?)-?%\}/i.exec(wrapper.text());
  return m ? m[1]!.trim() : "";
}

/** Read the data source of a `{% for %}` wrapper (with its managed assign, if any). */
export function readDataSource(wrapper: NodeHandle): DataSource | null {
  if (!wrapper.alive) return null;
  const p = parseFor(forInner(wrapper));
  if (!p) return null;
  const args = Object.fromEntries(wrapper.args().map((a) => [a.name, a.source]));
  const mgd = managedAssign(wrapper, p.collection);
  const anchor = anchorOf(wrapper);
  let base = p.collection;
  let where: WhereClause[] = [];
  let sort = "";
  let split = "";
  if (mgd) {
    const { base: b, filters } = splitPipeline(mgd.rhs);
    base = b;
    ({ where, sort, split } = parseFilters(filters));
  }
  return {
    item: p.item,
    base,
    where,
    sort,
    split,
    reversed: p.reversed,
    limit: args.limit ?? "",
    offset: args.offset ?? "",
    assign: mgd?.handle ?? null,
    var: mgd?.var ?? null,
    urlFilters: mgd?.urlFilters ?? [],
    paginate: anchor === wrapper ? null : anchor,
    anchor,
  };
}

/** The RHS pipeline for the managed assign, or null when no filters/sort/split are set. */
export function buildPipeline(ds: Pick<DataSource, "base" | "where" | "sort" | "split">): string | null {
  const filters: string[] = [];
  for (const w of ds.where) if (w.prop.trim()) filters.push(`where: "${w.prop.trim()}", "${w.value}"`);
  if (ds.split.trim()) filters.push(`split: "${ds.split.trim()}"`);
  if (ds.sort.trim()) filters.push(`sort: "${ds.sort.trim()}"`);
  return filters.length ? `${ds.base} | ${filters.join(" | ")}` : null;
}
