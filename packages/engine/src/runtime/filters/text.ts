import type { BuiltinFilter } from "./types";

/** https://shopify.dev/docs/api/liquid/filters/handleize */
export const handleize: BuiltinFilter = {
  name: "handleize",
  returns: "string",
  describe: "Lowercase, hyphen-separated slug: 'Health & Beauty' becomes 'health-beauty'.",
  run: (v) =>
    String(v ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
};

/** https://shopify.dev/docs/api/liquid/filters/pluralize */
export const pluralize: BuiltinFilter = {
  name: "pluralize",
  returns: "string",
  describe: "Pick the singular for 1, otherwise the plural: {{ count | pluralize: 'item', 'items' }}.",
  run: (v, args) => (Number(v) === 1 ? String(args[0] ?? "") : String(args[1] ?? "")),
};

const slugOf = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Rows for a nested `{% for %}`: a string (split on the optional delimiter) or an array whose primitives
 * become `{ id, value, title, slug, src, image }` so a template binds `{{item.value}}` / `{{item.src}}`
 * the same way for strings and objects. Objects pass through unchanged. Mirrors the SDK's
 * `resolveNestedItems` (what the old static walker iterated for `Data` `scope` + `splitBy`).
 */
export const data_items: BuiltinFilter = {
  name: "data_items",
  returns: "array",
  describe: "Rows for a nested loop: {% for item in item.sizes | data_items: ',' %} splits a string; strings in an array become { value, title, slug, src, image }.",
  run: (v, args) => {
    const delim = typeof args[0] === "string" && args[0] ? args[0] : null;
    let list: unknown[];
    if (typeof v === "string" && delim) list = v.split(delim).map((s) => s.trim()).filter(Boolean);
    else if (Array.isArray(v)) list = v;
    else return [];
    return list.map((x, i) => {
      if (typeof x !== "string" && typeof x !== "number") return x;
      const s = String(x);
      return { id: String(i), value: s, title: s, slug: slugOf(s), src: s, image: s };
    });
  },
};

/**
 * Liquid's `where`, widened the way the collection query filters: `rows | where: 'field', 'value'` keeps a
 * row when a scalar field equals the value OR a list field (`categories`, `tags`, `sizes`) CONTAINS it.
 * Stock `where` is equality-only, so a filter on a list field matched nothing. Reads the row's top-level
 * field, then its `metadata` copy; values compare as strings. One argument keeps only rows where the field
 * is truthy, as in Liquid. Row order is kept.
 */
export const where: BuiltinFilter = {
  name: "where",
  returns: "array",
  describe: "Rows where a field equals a value, or a list field contains it: {% assign r = rows | where: 'categories', 'apparel' %}.",
  run: (v, args) => {
    if (!Array.isArray(v)) return [];
    const field = String(args[0] ?? "");
    const hasValue = args.length > 1;
    const want = String(args[1] ?? "");
    return v.filter((row) => {
      if (row == null || typeof row !== "object") return false;
      const r = row as Record<string, any>;
      const x = r[field] ?? r.metadata?.[field];
      if (!hasValue) return Array.isArray(x) ? x.length > 0 : !!x && x !== "false";
      return Array.isArray(x) ? x.map(String).includes(want) : x != null && String(x) === want;
    });
  },
};

const humanize = (key: string): string =>
  key.split(/[_\s-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

/**
 * Collection rows -> facet rows, one per key: `{ id, title, slug, metadata: { key, values: [{ value, count,
 * facetKey, id }] } }`, values ordered by count (high first) then value. What the live `<collection>.facets`
 * feed returns for the (already filtered) rows it counts over. A list field counts each of its entries and a comma-separated string each of its parts; empty
 * values are skipped; a key no row carries still yields its row with no values. Mirrors the live pipeline's
 * `$unwind` + `$group` + `$sort { count: -1, _id: 1 }`.
 */
export const facets: BuiltinFilter = {
  name: "facets",
  returns: "array",
  describe: "Facet rows for a list of fields, counted over these rows: {% assign f = products | facets: 'colors,sizes' %}.",
  run: (v, args) => {
    const rows = Array.isArray(v) ? v : [];
    const keys = String(args[0] ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    return keys.map((key) => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        if (row == null || typeof row !== "object") continue;
        const r = row as Record<string, any>;
        const x = r[key] ?? r.metadata?.[key];
        // The live tokenizer: a list counts each entry, a comma-separated string counts each part.
        const tokens = x == null ? [] : Array.isArray(x) ? x.map((e) => String(e ?? "").trim()) : String(x).split(",").map((e) => e.trim());
        for (const t of tokens) if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const values = [...counts]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([value, count]) => ({ value, count, facetKey: key, id: `${key}:${value}` }));
      return { id: key, title: humanize(key), slug: key, metadata: { key, values } };
    });
  },
};
