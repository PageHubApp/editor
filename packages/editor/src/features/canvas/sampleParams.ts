/**
 * The canvas's stand-in for the URL of a detail page. A page like `/product/:handle` picks its row from
 * `request.params.handle`, which the canvas has no URL to supply, so the page would render empty and nothing on it could
 * be selected. This fills each `request.params.<name>` the page reads with a value taken from the first row of the list
 * the page filters by — the sample row the old editor showed:
 *
 *   {% assign rows = product | where: 'slug', request.params.handle %}   →   params.handle = first product's slug
 *
 * A param the page doesn't filter a list by is left unset. Editor-only: a publish render has the real URL.
 *
 *   sampleRequest(pageSource, data) // { path: "/", method: "GET", query: {}, params: { handle: "fern-pot" } }
 */

const PARAM = /request\.params\.(\w+)/g;
const FILTERED = /([A-Za-z_][\w.]*)\s*\|\s*where:\s*(['"])([\w.]+)\2\s*,\s*request\.params\.(\w+)/g;

const at = (value: unknown, path: string): unknown => {
  let v = value;
  for (const k of path.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
};

/** The `request` global for the canvas render, with a sample value for every filtered `request.params.*` the page reads. */
export function sampleRequest(source: string, data: Record<string, unknown>): { path: string; method: string; query: Record<string, string>; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const wanted = new Set([...source.matchAll(PARAM)].map((m) => m[1]!));
  for (const m of source.matchAll(FILTERED)) {
    const [, list, , field, name] = m as unknown as [string, string, string, string, string];
    if (!wanted.has(name) || params[name]) continue;
    const rows = at(data, list);
    if (!Array.isArray(rows)) continue;
    const sample = rows.map((r) => at(r, field)).find((v) => (typeof v === "string" && v) || typeof v === "number");
    if (sample !== undefined) params[name] = String(sample);
  }
  return { path: "/", method: "GET", query: {}, params };
}
