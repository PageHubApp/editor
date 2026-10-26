/**
 * Built-in filters are plain data: `{ name, returns, describe, run(value, args, ctx) }` — the
 * exact shape `defineFilter` takes, so a built-in is wrapped as
 * `defineFilter({ ...filter, args: [...schemas] })` and `builtinFilters` here is only the
 * liquidjs adapter. `run` is pure and cheap: no I/O, no clock reads, no globals.
 */
export interface HostProviders {
  /** Media id → CDN URL, e.g. `imageUrl("k3j9", { width: 1600 })`. */
  imageUrl?(id: string, opts: { width?: number; height?: number; crop?: string; format?: string }): string;
  /** Site file name → URL (`file_url`). */
  fileUrl?(name: string): string;
  /** Icon ref (`tb/TbPhone`) → inline SVG markup, or undefined when unknown. Trusted host output. */
  icon?(ref: string): string | undefined;
  /** Site JS file name (`app.js`, the file `assets/app.js`) → URL. Absent: `/assets/<name>`. */
  assetUrl?(name: string): string;
}

export type HostProviderName = keyof HostProviders;

export interface FilterCtx {
  /** Read a variable from the render scope (`["site", "currency"]`). */
  get(path: string[]): unknown;
  /** The engine's `date` filter (UTC unless the engine says otherwise). */
  formatDate(value: unknown, format: string): string;
  host: HostProviders;
}

export interface BuiltinFilter {
  name: string;
  returns: "string" | "url" | "number" | "html" | "array" | "object";
  describe: string;
  /** Needs this host provider; creation throws `HostMissingError` when it is asked for and absent. */
  host?: HostProviderName;
  run(value: unknown, args: unknown[], ctx: FilterCtx): unknown;
}

export class HostMissingError extends Error {
  constructor(public readonly filters: string[], public readonly providers: HostProviderName[]) {
    super(`filters ${filters.map((f) => `"${f}"`).join(", ")} need a host provider (${providers.join(", ")}) that was not supplied`);
    this.name = "HostMissingError";
  }
}

/** liquidjs passes `key: value` filter arguments as `[key, value]` pairs among the positional ones. */
export function splitArgs(args: unknown[]): { pos: unknown[]; kv: Record<string, unknown> } {
  const pos: unknown[] = [];
  const kv: Record<string, unknown> = {};
  for (const a of args) {
    if (Array.isArray(a) && a.length === 2 && typeof a[0] === "string") kv[a[0]] = a[1];
    else pos.push(a);
  }
  return { pos, kv };
}

/** A URL safe for `href` / `src`: relative, http(s), mailto, tel; never `javascript:` and friends. */
export function safeUrl(value: unknown): string {
  const u = String(value ?? "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^(https?|mailto|tel):/i.test(u)) return "";
  return u;
}
