import { get, set, splitKey, truthy } from "./state-store";

/** The state key the cart drawer's panel and backdrop gate on (`data-state-show="cart:open"`); `data-cart="open"` toggles it. */
export const CART_OPEN = "cart:open";

const num = (el: Element, name: string) => {
  const v = el.getAttribute(name);
  return v == null || v === "" || isNaN(+v) ? undefined : +v;
};

/**
 * Runs the state actions on `el` in order (`data-state-set`, `-toggle`, `-clear`, `-step`, and `data-cart="open"`, which toggles
 * `cart:open`). Each write goes through `put` (default: the store), reading live values with `get`, so a caller can record or
 * redo the writes (the editor's "Open on canvas" preview does).
 */
export function runStateAction(el: Element, put: (key: string, value: string | undefined) => void = set): void {
  const a = (n: string) => el.getAttribute("data-state-" + n);
  const setA = a("set");
  if (setA != null)
    for (const one of setA.split(";")) {
      const [k, v] = splitKey(one);
      put(k, v ?? "true");
    }
  const tog = a("toggle");
  if (tog != null) {
    const [k, v] = splitKey(tog);
    if (v == null) put(k, truthy(get(k)) ? undefined : "true");
    else {
      const [x, y] = v.split("|");
      put(k, get(k) === x ? y : x);
    }
  }
  const clr = a("clear");
  if (clr != null) for (const k of clr.split(";")) put(k.trim(), undefined);
  const step = a("step");
  if (step != null) {
    const [k, d] = splitKey(step);
    const [min, max] = [num(el, "data-min"), num(el, "data-max")];
    let n = (Number(get(k)) || min || 0) + (Number(d) || 1);
    if (max !== undefined && n > max) n = el.hasAttribute("data-wrap") ? (min ?? 0) : max;
    if (min !== undefined && n < min) n = el.hasAttribute("data-wrap") ? (max ?? min) : min;
    put(k, String(n));
  }
  if (el.getAttribute("data-cart") === "open") put(CART_OPEN, truthy(get(CART_OPEN)) ? undefined : "true");
}
