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
import { defaultOperators, Liquid, type FilterImplOptions, type Operators } from "liquidjs";
import type { TagClass } from "../runtime/defineTag";
import { escapeHtml } from "../runtime/escape";
import { PaginateTag } from "./tags/paginate";
import { instantOf, minutesWestAt, serverLocalWallClock, wallClockInstant } from "./wallClock";

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

/**
 * A price object (`{ amount, currency, formatted }`) used as a value is its stored amount: printed, compared or in math.
 * Data stays plain JSON and a Drop would open prototype lookups, so the engine does this where values are used.
 */
function printedValue(v: unknown): unknown {
  const amount = v && typeof v === "object" ? (v as { amount?: unknown }).amount : undefined;
  return typeof amount === "number" ? amount : v;
}

const COMPARISONS = ["==", "!=", ">", "<", ">=", "<="] as const;
const NUMERIC_FILTERS = ["abs", "at_least", "at_most", "ceil", "divided_by", "floor", "minus", "modulo", "plus", "round", "times", "money", "money_with_currency"];

function comparePrices(): Operators {
  const operators: Operators = { ...defaultOperators };
  for (const name of COMPARISONS) {
    const core = defaultOperators[name] as unknown as (l: unknown, r: unknown, ctx: unknown) => Generator<unknown, boolean, unknown>;
    operators[name] = function* (l: unknown, r: unknown, ctx: unknown) {
      return yield* core(printedValue(l), printedValue(r), ctx);
    } as unknown as Operators[string];
  }
  return operators;
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
    operators: comparePrices(),
  });
  const coreOutput = engine.options.outputEscape as (this: unknown, v: unknown) => string;
  engine.options.outputEscape = function (this: unknown, v: unknown) {
    return coreOutput.call(this, printedValue(v));
  };
  // `| escape` (a habit from Shopify themes) already returns safe text: written as the last filter it is not escaped a second
  // time by outputEscape, which would print `&amp;lt;` for `<`.
  engine.registerFilter("escape", { handler: (v: unknown) => escapeHtml(printedValue(v)), raw: true } as unknown as FilterImplOptions);
  const coreDate = engine.filters.date as unknown as (this: unknown, v: unknown, ...rest: unknown[]) => unknown;
  engine.registerFilter("date", function (this: unknown, v: unknown, ...rest: unknown[]) {
    // A string with no offset is a wall-clock time in the site's zone, never the server's (wallClock.ts).
    const zone = options.timezoneOffset ?? 0;
    const wall = wallClockInstant(v, zone);
    if (wall && Number.isNaN(wall.getTime())) return v; // `2027-02-30`: not a date, left as written like any other unparsable value
    // A named site zone works around two liquidjs daylight-saving slips (wallClock.ts). A zone the template names itself is its own.
    const instant = typeof zone === "string" && rest[1] === undefined ? instantOf(v, zone) : null;
    if (instant) {
      // A format that prints the offset needs the true one; every other format reads the wall-clock fields.
      if (/%[:^-]?[zZ]/.test(String(rest[0] ?? ""))) return coreDate.call(this, instant, rest[0], minutesWestAt(zone as string, instant));
      const local = serverLocalWallClock(zone as string, instant);
      return coreDate.call(this, local, rest[0], local.getTimezoneOffset());
    }
    return coreDate.call(this, wall ?? v, ...rest);
  } as unknown as FilterImplOptions);
  for (const name of REMOVED_TAGS) delete (engine.tags as Record<string, TagClass>)[name];
  engine.registerTag("paginate", PaginateTag);
  for (const [name, impl] of Object.entries(options.filters ?? {})) engine.registerFilter(name, impl);
  for (const [name, impl] of Object.entries(options.tags ?? {})) engine.registerTag(name, impl);
  for (const name of NUMERIC_FILTERS) {
    const impl = engine.filters[name] as unknown as ((...args: unknown[]) => unknown) | { handler: (...args: unknown[]) => unknown } | undefined;
    if (!impl) continue;
    const handler = typeof impl === "function" ? impl : impl.handler;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      return handler.apply(this, args.map(printedValue));
    };
    engine.registerFilter(name, (typeof impl === "function" ? wrapped : { ...impl, handler: wrapped }) as unknown as FilterImplOptions);
  }
  return engine;
}
