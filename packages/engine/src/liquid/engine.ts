/**
 * The sandboxed liquidjs renderer. Every option here is a security or correctness
 * decision, so hosts can add tags and filters but cannot loosen these:
 *
 *  - `outputEscape: "escape"` — liquidjs does NOT escape output by default. With this,
 *    `{{ value }}` is HTML-escaped and only `| raw` (for filters that return trusted HTML,
 *    such as `icon` or `image_tag`) writes markup.
 *  - `ownPropertyOnly` — no prototype-chain lookups (`x.constructor` renders empty).
 *  - `strictFilters` — an unknown filter is a parse error, not a silent no-op.
 *  - parse / render / memory limits — runaway templates stop with an error.
 *    `renderLimit` is checked between template nodes, so filters must be cheap and do no I/O.
 *  - `timezoneOffset` — the site's timezone (an IANA name, Shopify's semantics; default UTC, never the server's).
 *    `date` renders in it, `'now'` is now in it, a string with an offset (`...Z`, `+02:00`) is shifted into it, and a
 *    string without one (`2026-06-15`, `2026-06-15 10:00`) is a wall-clock time in it, so it never shifts a day.
 *  - `include`, `layout` and `block` are removed: `include` is deprecated in favour of
 *    `render`, and liquidjs's `layout` / `block` mean template inheritance, not Shopify's
 *    tags of the same names.
 */
import { Liquid, type FilterImplOptions } from "liquidjs";
import type { TagClass } from "../runtime/defineTag";
import { escapeHtml } from "../runtime/escape";
import { PaginateTag } from "./tags/paginate";
import { wallClockInstant } from "./wallClock";

export interface RenderLimits {
  /** Max template source length per parse, in characters. */
  parseLimit: number;
  /** Max wall-clock time per render, in ms. */
  renderLimit: number;
  /** Max allocation units (string / array growth) per render. */
  memoryLimit: number;
}

export const DEFAULT_LIMITS: RenderLimits = { parseLimit: 1e6, renderLimit: 200, memoryLimit: 1e7 };

/** Core tags removed from the engine; using one is a parse error. */
export const REMOVED_TAGS = ["include", "layout", "block"] as const;

export interface EngineOptions {
  /** In-memory partials for `{% render 'name' %}`, keyed by name (no extension). */
  partials?: Record<string, string>;
  limits?: Partial<RenderLimits>;
  /** Minutes west of UTC, as liquidjs expects; or an IANA zone name. Default 0 (UTC). */
  timezoneOffset?: number | string;
  filters?: Record<string, FilterImplOptions>;
  tags?: Record<string, TagClass>;
}

export function createEngine(options: EngineOptions = {}): Liquid {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const engine = new Liquid({
    templates: options.partials ?? {},
    outputEscape: "escape",
    ownPropertyOnly: true,
    strictFilters: true,
    strictVariables: false,
    timezoneOffset: options.timezoneOffset ?? 0,
    parseLimit: limits.parseLimit,
    renderLimit: limits.renderLimit,
    memoryLimit: limits.memoryLimit,
    cache: true,
  });
  // `| escape` (a habit from Shopify themes) already returns safe text: written as the last filter it is not escaped a second
  // time by outputEscape, which would print `&amp;lt;` for `<`.
  engine.registerFilter("escape", { handler: (v: unknown) => escapeHtml(v), raw: true } as unknown as FilterImplOptions);
  const coreDate = engine.filters.date as unknown as (this: unknown, v: unknown, ...rest: unknown[]) => unknown;
  engine.registerFilter("date", function (this: unknown, v: unknown, ...rest: unknown[]) {
    // A string with no offset is a wall-clock time in the site's zone, never the server's (wallClock.ts).
    const wall = wallClockInstant(v, options.timezoneOffset ?? 0);
    if (wall && Number.isNaN(wall.getTime())) return v; // `2027-02-30`: not a date, left as written like any other unparsable value
    return coreDate.call(this, wall ?? v, ...rest);
  } as unknown as FilterImplOptions);
  for (const name of REMOVED_TAGS) delete (engine.tags as Record<string, TagClass>)[name];
  engine.registerTag("paginate", PaginateTag);
  for (const [name, impl] of Object.entries(options.filters ?? {})) engine.registerFilter(name, impl);
  for (const [name, impl] of Object.entries(options.tags ?? {})) engine.registerTag(name, impl);
  return engine;
}
