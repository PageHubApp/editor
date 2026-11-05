/**
 * The canvas's stand-in for the URL of a detail page. A page like `/product/:handle` picks its row from
 * `request.params.handle`, which the canvas has no URL to supply, so the page would render empty and nothing on it could
 * be selected. This fills each `request.params.<name>` the page reads with a value taken from the first row of the list
 * the page filters by — the sample row the old editor showed:
 *
 *   {% assign rows = product | where: 'slug', request.params.handle %}   →   params.handle = first product's slug
 *
 * The author can pick another row to preview (the "Previewing" switcher, `canvas.previewParams`): its values come in as
 * `chosen` and win over the first row. A param the page doesn't filter a list by is left unset. Editor-only: a publish
 * render has the real URL.
 *
 *   sampleRequest(pageSource, data) // { path: "/", method: "GET", query: {}, params: { handle: "fern-pot" } }
 */

const PARAM = /request\.params\.(\w+)/g;
const FILTERED = /([A-Za-z_][\w.]*)\s*\|\s*where:\s*(['"])([\w.]+)\2\s*,\s*request\.params\.(\w+)/g;

/** The value at a dotted `path` in `value` (`collections.plants`). */
export const valueAt = (value: unknown, path: string): unknown => {
  let v = value;
  for (const k of path.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
};

/** One `request.params.<name>` a detail page picks its row by: the list it filters and the row field it compares. */
export interface DetailParam {
  /** The list expression (`collections.plants`). */
  list: string;
  /** The row field compared with the param (`slug`). */
  field: string;
  /** The param name (`slug` in `request.params.slug`). */
  name: string;
}

/** The params the page filters a list by, first occurrence of each name. */
export function detailParams(source: string): DetailParam[] {
  const out: DetailParam[] = [];
  for (const m of source.matchAll(FILTERED)) {
    const [, list, , field, name] = m as unknown as [string, string, string, string, string];
    if (!out.some((p) => p.name === name)) out.push({ list, field, name });
  }
  return out;
}

/** A row's param value (a string or a number); null when it has none. */
export const paramValueOf = (row: unknown, field: string): string | null => {
  const v = valueAt(row, field);
  return (typeof v === "string" && v) || typeof v === "number" ? String(v) : null;
};

/** The `request` global for the canvas render, with a sample value for every filtered `request.params.*` the page reads. */
export function sampleRequest(
  source: string,
  data: Record<string, unknown>,
  chosen?: Readonly<Record<string, string>>,
): { path: string; method: string; query: Record<string, string>; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const wanted = new Set([...source.matchAll(PARAM)].map((m) => m[1]!));
  for (const m of source.matchAll(FILTERED)) {
    const [, list, , field, name] = m as unknown as [string, string, string, string, string];
    if (!wanted.has(name) || params[name]) continue;
    const rows = valueAt(data, list);
    if (!Array.isArray(rows)) continue;
    const values = rows.map((r) => paramValueOf(r, field)).filter((v): v is string => v !== null);
    const pick = chosen?.[name] && values.includes(chosen[name]!) ? chosen[name]! : values[0];
    if (pick !== undefined) params[name] = pick;
  }
  return { path: "/", method: "GET", query: {}, params };
}
