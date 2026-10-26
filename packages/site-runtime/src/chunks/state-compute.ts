import { get, set, subscribe } from "../state-store";

interface Variant {
  inventory?: number;
  [slot: string]: unknown;
}

/**
 * `data-state-compute="count"` writes how many of the `data-from` keys equal `data-count-value` (or are non-empty, with no value) to `data-compute-key` (a quiz score).
 *
 * `data-state-compute="variant-match"`, a product variant picker. `data-variants` is the JSON array of variants (each
 * with `option1..3`, the values of the axes in `data-axes` order), `data-axes` the comma-separated axis names, and
 * `data-axis-key` the key template the option chips write (`pdp:current:axis:%axis%`). Once every axis has a pick it writes
 * the matching in-stock variant, as JSON, to `data-compute-key` (read it with `data-state-text="<key>.formatted"`,
 * `data-state-src="{{state.<key>.image}}"` or `data-state-show="<key>"`); otherwise the key is cleared.
 */
export function mount(el: Element) {
  const kind = el.getAttribute("data-state-compute");
  if (kind === "count") {
    // `data-from` is the comma-separated keys to read, `data-count-value` the value that counts: the key holds how many match.
    const from = (el.getAttribute("data-from") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const want = el.getAttribute("data-count-value") || undefined; // without a value, every non-empty key counts
    const tally = () => set(el.getAttribute("data-compute-key") || "count", String(from.filter((k) => (want === undefined ? !!get(k) : get(k) === want)).length));
    subscribe(tally);
    tally();
    return;
  }
  if (kind !== "variant-match") return;
  let variants: Variant[] = [];
  try {
    const v = JSON.parse(el.getAttribute("data-variants") || "[]");
    if (Array.isArray(v)) variants = v;
  } catch {
    return;
  }
  const axes = (el.getAttribute("data-axes") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const key = el.getAttribute("data-compute-key") || "variant";
  const template = el.getAttribute("data-axis-key") || key + ":axis:%axis%";
  const compute = () => {
    const picked = axes.map((a) => get(template.replace("%axis%", a)));
    const hit = axes.length && picked.every(Boolean) ? variants.find((v) => v.inventory !== 0 && picked.every((p, i) => v["option" + (i + 1)] === p)) : undefined;
    set(key, hit && JSON.stringify(hit));
  };
  subscribe(compute);
  compute();
}
