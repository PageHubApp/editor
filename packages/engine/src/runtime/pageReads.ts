/**
 * `pageReads` — what a page reads, found statically, so a host can decide how to serve it.
 *
 * A page that reads nothing visitor-specific renders once at publish time and is served as a file. A
 * page that reads `request.query`, the signed-in `customer`, or a gated collection has to be rendered
 * per request. The answer comes from liquidjs's static analysis over the page and every section and
 * partial it pulls in (`collectSources`), not from running it.
 *
 * Analysis is per file, so a partial that receives an argument named like a global (`{% render 'x',
 * customer: c %}`) is read as a global. That errs towards "reads it", which only ever makes a page
 * render per request, never serve stale.
 */
import { collectSources, type PageRecord } from "./renderPage";
import type { Renderer } from "./createRenderer";

export interface PageReads {
  /** Any `request.query.*` (or `request.query` itself). */
  query: boolean;
  /**
   * `none`: no `customer`. `presence`: only whether there is one (`{% if customer %}`, `customer.signed_in`),
   * which a signed-in and an anonymous variant of the page can answer. `fields`: any other `customer.<field>`.
   */
  customer: "none" | "presence" | "fields";
  /** A read the host's `gated` option flagged, e.g. a gated collection. Always false without that option. */
  gated: boolean;
  /** The page depends on the clock: the `'now'` literal (`{{ 'now' | date: '%Y' }}`) or a `now` / `today` / `year` global. */
  time: boolean;
  /** The top-level globals read across the page and its sections and partials, sorted (`products`, `request`, …). */
  globals: string[];
}

export interface PageReadsOptions {
  /** Is this read gated (per visitor, per plan)? Gets the variable's path segments, e.g. `["members", "posts"]`. */
  gated?(segments: readonly string[]): boolean;
}

/** Fields of `customer` that exist on both the anonymous and the signed-in variant. */
const PRESENCE_FIELDS = new Set(["signed_in"]);
const NOW_LITERAL = /(['"])now\1/;
const TIME_GLOBALS = new Set(["now", "today", "year"]);

export async function pageReads(r: Pick<Renderer, "readFile" | "variables">, page: Pick<PageRecord, "path" | "source">, opts: PageReadsOptions = {}): Promise<PageReads> {
  const sources = collectSources(r, page);
  const overrides = Object.fromEntries(sources);
  const reads: PageReads = { query: false, customer: "none", gated: false, time: false, globals: [] };
  const globals = new Set<string>();
  for (const [path, text] of sources) {
    if (NOW_LITERAL.test(text)) reads.time = true;
    for (const segments of await r.variables(path, { overrides })) {
      const [head, second] = segments;
      if (head === undefined) continue;
      globals.add(head);
      if (head === "request" && second === "query") reads.query = true;
      if (head === "customer") {
        if (segments.length === 1 || (segments.length === 2 && PRESENCE_FIELDS.has(second!))) {
          if (reads.customer === "none") reads.customer = "presence";
        } else reads.customer = "fields";
      }
      if (TIME_GLOBALS.has(head)) reads.time = true;
      if (opts.gated?.(segments)) reads.gated = true;
    }
  }
  reads.globals = [...globals].sort();
  return reads;
}
