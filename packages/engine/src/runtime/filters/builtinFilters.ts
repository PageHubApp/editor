/**
 * The built-in filters as data + a liquidjs registration map.
 *
 * `builtinFilters(host)` returns the map `createEngine({ filters })` takes. Host-backed filters
 * (`image_url`, `file_url`, `icon`) register only when their provider is supplied. Asking for one
 * by name (`include`) without its provider throws `HostMissingError` at creation, never at render.
 * Filters returning HTML (`TRUSTED_HTML_FILTERS`) are registered `raw: true`: their output is written
 * unescaped when they end the chain (their own output is escaped by construction).
 */
import type { FilterImplOptions } from "liquidjs";
import { default_errors, default_pagination, image_tag, link_to, time_tag } from "./html";
import { asset_url, file_url, icon, image_url } from "./host";
import { money, money_with_currency } from "./money";
import { data_items, handleize, pluralize, where, facets } from "./text";
import { HostMissingError, type BuiltinFilter, type FilterCtx, type HostProviderName, type HostProviders } from "./types";

export const BUILTIN_FILTERS: readonly BuiltinFilter[] = [
  handleize, pluralize, data_items, where, facets, time_tag, link_to, money, money_with_currency,
  default_pagination, default_errors, image_tag, image_url, file_url, asset_url, icon,
];

/** Names whose output is trusted markup (`returns: "html"`). */
export const TRUSTED_HTML_FILTERS: ReadonlySet<string> = new Set(BUILTIN_FILTERS.filter((f) => f.returns === "html").map((f) => f.name));

type Impl = (this: { context: { getSync(p: string[]): unknown }; liquid: { filters: Record<string, unknown> } }, value: unknown, ...args: unknown[]) => unknown;

/** The liquidjs registration for a filter; `check` (when given) validates the arguments before `run`. */
export function adaptFilter(filter: BuiltinFilter, host: HostProviders, check?: (args: unknown[]) => void): FilterImplOptions {
  const impl: Impl = function (value, ...args) {
    check?.(args);
    const ctx: FilterCtx = {
      host,
      get: (path) => this.context.getSync(path),
      formatDate: (v, format) => String((this.liquid.filters.date as (this: unknown, v: unknown, f: string) => unknown).call(this, v, format)),
    };
    return filter.run(value, args, ctx);
  };
  // `raw: true` (liquidjs): as the LAST filter in a chain the output is not escaped, so trusted-HTML
  // filters read like Shopify's (`{{ errors | default_errors }}`); `| raw` after them still works.
  return (filter.returns === "html" ? { handler: impl, raw: true } : impl) as unknown as FilterImplOptions;
}

export function builtinFilters(host: HostProviders = {}, opts: { include?: readonly string[] } = {}): Record<string, FilterImplOptions> {
  const wanted = opts.include ? BUILTIN_FILTERS.filter((f) => opts.include!.includes(f.name)) : BUILTIN_FILTERS;
  if (opts.include) {
    const unknown = opts.include.filter((n) => !BUILTIN_FILTERS.some((f) => f.name === n));
    if (unknown.length) throw new Error(`unknown built-in filter(s): ${unknown.join(", ")}`);
    const missing = wanted.filter((f) => f.host && !host[f.host]);
    if (missing.length) throw new HostMissingError(missing.map((f) => f.name), [...new Set(missing.map((f) => f.host as HostProviderName))]);
  }
  const out: Record<string, FilterImplOptions> = {};
  for (const f of wanted) if (!f.host || host[f.host]) out[f.name] = adaptFilter(f, host);
  return out;
}
