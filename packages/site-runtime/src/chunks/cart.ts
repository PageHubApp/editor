import type { RuntimeConfig } from "../config";
import { trackOverlay, untrackOverlay } from "../overlays";
import { CART_OPEN as OPEN } from "../state-action";
import { get, set, subscribe, truthy } from "../state-store";

/** One cart line. `priceId` is the line identity (a payment-provider price id, or the `pd:<rowId>` sentinel); amounts are minor units. Same shape a payment-backed host stores. */
export interface CartLine {
  id: string;
  title: string;
  image?: string;
  priceId: string;
  priceFormatted: string;
  priceAmount: number;
  currency: string;
  quantity: number;
  /** Selected options, "Size 32 / Stone". Absent on single-variant products. */
  variantLabel?: string;
}
export interface Cart {
  items: CartLine[];
  count: number;
  /** Minor units. */
  totalAmount: number;
  /** "$64.00", or "" for an empty cart. What `cart:total` holds. */
  total: string;
}
export interface CheckoutOptions {
  successUrl: string;
  cancelUrl: string;
  promotionCode?: string;
}
/** Where the cart lives and how it checks out. `checkout` resolves to the URL to send the buyer to, or throws an Error whose message is shown in `cart:error`. */
export interface CartAdapter {
  get(): Promise<Cart>;
  add(line: CartLine): Promise<Cart>;
  /** Zero or less removes the line. */
  setQuantity(priceId: string, quantity: number): Promise<Cart>;
  clear(): Promise<Cart>;
  checkout(cart: Cart, opts: CheckoutOptions): Promise<string>;
}

const KEY = "cart";
const ERROR = "cart:error";

function toCart(items: CartLine[]): Cart {
  let count = 0;
  let totalAmount = 0;
  for (const l of items) {
    const q = Number(l.quantity) || 0;
    count += q;
    totalAmount += (Number(l.priceAmount) || 0) * q;
  }
  let total = "";
  if (totalAmount > 0) {
    const currency = String(items[0]?.currency || "usd").toUpperCase();
    try {
      total = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(totalAmount / 100);
    } catch {
      total = (totalAmount / 100).toFixed(2);
    }
  }
  return { items, count, totalAmount, total };
}

/**
 * The line for an add-to-cart item: the product row, already merged with its matched variant (a matched
 * variant brings its own `amount` / `formatted` and `option1..3`). Null when it has no price to check out with.
 */
export function toCartLine(item: Record<string, any>, quantity: number): CartLine | null {
  const priceId = String(item.metadata?.priceId || item.priceId || "");
  if (!priceId) return null;
  const price = item.price && typeof item.price === "object" ? item.price : {};
  const variantPriced = typeof item.amount === "number" && typeof item.formatted === "string";
  const line: CartLine = {
    id: String(item.id || ""),
    title: String(item.title || ""),
    priceId,
    priceFormatted: String((variantPriced ? item.formatted : price.formatted) || ""),
    priceAmount: Number(variantPriced ? item.amount : price.amount) || 0,
    currency: String(price.currency || item.currency || "usd"),
    quantity: quantity > 0 ? Math.floor(quantity) : 1,
  };
  if (item.image) line.image = String(item.image);
  if (item.hasMultipleVariants) {
    // Option values in `optionNamesCsv` order (one per named axis), else whatever option slots the variant fills.
    const named = typeof item.optionNamesCsv === "string" ? item.optionNamesCsv.split(",").filter((s: string) => s.trim()).length : 0;
    const n = named ? Math.min(named, 3) : 3;
    const parts = [1, 2, 3].slice(0, n).map((i) => item["option" + i]).filter((v) => typeof v === "string" && v);
    if (parts.length) line.variantLabel = parts.join(" / ");
  }
  return line;
}

const isLine = (l: any): l is CartLine => !!l && typeof l === "object" && typeof l.id === "string" && typeof l.priceId === "string" && !!l.priceId;

/**
 * Default adapter: lines in localStorage under `cfg.key` (default `cart`). Checkout POSTs the lines (plus `cfg.body`)
 * to `cfg.api` and follows the returned `url`; with no `api` there is no hosted checkout, so it goes to `cfg.endpoint`
 * (default `/checkout`) with `?items=priceId:qty,…`.
 */
export function localCart(win: Window, cfg: NonNullable<RuntimeConfig["cart"]> = {}): CartAdapter {
  const key = cfg.key || KEY;
  const read = (): CartLine[] => {
    try {
      const v = JSON.parse(win.localStorage.getItem(key) || "[]");
      return Array.isArray(v) && v.every(isLine) ? v : [];
    } catch {
      return [];
    }
  };
  const write = (items: CartLine[]): Cart => {
    try {
      items.length ? win.localStorage.setItem(key, JSON.stringify(items)) : win.localStorage.removeItem(key);
    } catch {
      /* the cart lives for this page only */
    }
    return toCart(items);
  };
  return {
    get: async () => toCart(read()),
    async add(line) {
      const items = read();
      const hit = items.find((l) => l.priceId === line.priceId);
      hit ? (hit.quantity += line.quantity) : items.push(line);
      return write(items);
    },
    async setQuantity(priceId, quantity) {
      return write(read().flatMap((l) => (l.priceId !== priceId ? [l] : quantity > 0 ? [{ ...l, quantity }] : [])));
    },
    clear: async () => write([]),
    async checkout(cart, o) {
      const api = cfg.api;
      if (!api) return (cfg.endpoint ?? "/checkout") + "?items=" + cart.items.map((l) => l.priceId + ":" + l.quantity).join(",");
      let d: any = null;
      try {
        const r = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...cfg.body,
            items: cart.items.map((l) => ({ priceId: l.priceId, quantity: l.quantity })),
            successUrl: o.successUrl,
            cancelUrl: o.cancelUrl,
            promotionCode: o.promotionCode || undefined,
          }),
        });
        d = await r.json().catch(() => null);
      } catch {
        throw new Error("Couldn't reach checkout. Check your connection and try again.");
      }
      if (d?.url) return String(d.url);
      if (d?.code === "invalid_promo") set("cart:promo-invalid", d.error || "That promo code isn't valid");
      throw new Error(d?.error || "Checkout didn't start. Try again in a moment.");
    },
  };
}

/** Absolute URL the buyer returns to from checkout: `href` when it is a site path, else this page, plus `checkout=<status>`. */
function returnUrl(win: Window, href: string | null, status: "success" | "cancel"): string {
  const loc = win.location;
  const path = href && href.startsWith("/") ? href.split("#")[0]! : loc.pathname;
  return loc.origin + path + (path.includes("?") ? "&" : "?") + "checkout=" + status;
}

/** The parsed `data-cart-item` JSON, or null. It is the product row's cart fields, written by the converter as `{{ item.* }}` bindings. */
function itemOf(el: Element): Record<string, any> | null {
  try {
    const v = JSON.parse(el.getAttribute("data-cart-item") || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Merges the picked variant over the item. The picks are the state keys `data-cart-variant-axes` names
 * (`pdp:current:axis:%axis%`, one per axis in `optionNamesCsv` order, written by the option chips); the variant is the
 * `variantMapJson` row whose `option1..3` match them. Null when a multi-variant product has no complete pick.
 */
function withVariant(item: Record<string, any>, template: string | null): Record<string, any> | null {
  if (!item.hasMultipleVariants) return item;
  let variants: any[] = [];
  try {
    const v = JSON.parse(String(item.variantMapJson || "[]"));
    if (Array.isArray(v)) variants = v;
  } catch {
    /* no variants to match */
  }
  const axes = String(item.optionNamesCsv || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!template || !axes.length) return null;
  const picks = axes.map((a) => get(template.replace("%axis%", a)));
  if (!picks.every(Boolean)) return null;
  const hit = variants.find((v) => picks.every((p, i) => String(v["option" + (i + 1)]) === p));
  return hit ? { ...item, ...hit, metadata: { ...(item.metadata || {}), priceId: hit.priceId } } : null;
}

/**
 * `data-cart="add|open|checkout"` on a button or form.
 *
 * - add: the button's `data-cart-item` (the product row's cart fields as JSON, see `toCartLine`), or just
 *   `data-cart-id` / the form's `id` field. Quantity from the `data-cart-qty-field` input, the form's `quantity` field,
 *   `data-cart-qty`, else 1. A multi-variant item needs its options picked (`data-cart-variant-axes`).
 * - open: toggles the `cart:open` state key; the drawer panel and backdrop carry `data-state-show="cart:open"`.
 * - checkout: sends the lines to the adapter's checkout; `data-cart-success` / `data-cart-cancel` are the return paths.
 *
 * `[data-cart-count]` shows the item count (`[data-cart-items]` lists the lines: the `cart-items` chunk). The cart is published into the
 * state store as `cart:count`, `cart:total`, `cart:items-json`, with failures in `cart:error`.
 */
export function init(doc: Document, cfg: RuntimeConfig): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  const win = doc.defaultView!;
  const cart = cfg.cart?.adapter ?? localCart(win, cfg.cart);
  let current: Cart = toCart([]);
  const publish = (c: Cart) => {
    current = c;
    doc.querySelectorAll("[data-cart-count]").forEach((el) => (el.textContent = String(c.count)));
    set("cart:count", String(c.count));
    set("cart:total", c.total || undefined);
    set("cart:items-json", JSON.stringify(c.items));
  };
  const refresh = () => cart.get().then(publish);
  const apply = async (p: Promise<Cart>) => {
    const c = await p;
    publish(c);
    doc.dispatchEvent(new CustomEvent("cart:change", { detail: c }));
  };

  // Back from checkout: a paid order empties the cart. The status is mirrored to `cart:checkout-status` for
  // thank-you / cancelled panels, and the param is dropped so a refresh doesn't replay it.
  const url = new URL(win.location.href);
  const status = url.searchParams.get("checkout");
  if (status === "success" || status === "cancel") {
    url.searchParams.delete("checkout");
    win.history.replaceState(win.history.state, "", url);
    set("cart:checkout-status", status);
    if (status === "success") {
      set(OPEN, undefined);
      void apply(cart.clear());
    }
  }
  if (!(status === "success")) void refresh();

  win.addEventListener("storage", () => void refresh(), { signal });
  doc.addEventListener("cart:refresh", () => void refresh(), { signal });

  // Editing canvas (`data-ph-edit`): the cart renders (count, lines), but no cart action responds to a click or submit.
  const isEdit = () => doc.documentElement.hasAttribute("data-ph-edit");
  const hasDrawer = () => !!doc.querySelector('[data-state-show="' + OPEN + '"]');
  // The open drawer joins the Escape stack with the other overlays; Escape closes whichever opened last.
  let drawerOpen = false;
  const unsubscribe = subscribe(() => {
    const now = truthy(get(OPEN));
    if (now === drawerOpen) return;
    drawerOpen = now;
    now ? trackOverlay(doc, ac, () => set(OPEN, undefined)) : untrackOverlay(doc, ac);
  });

  const add = async (el: Element, form: HTMLFormElement | null) => {
    const f = form ? new FormData(form) : null;
    const item = itemOf(el) ?? { id: String(f?.get("id") ?? el.getAttribute("data-cart-id") ?? "") };
    if (!item.id && !item.metadata?.priceId) return;
    // A bare `id` (hand-written markup) is its own price id; the title falls back to it.
    if (!item.metadata?.priceId && !item.priceId) item.priceId = item.id;
    item.title ??= item.id;
    const picked = withVariant(item, el.getAttribute("data-cart-variant-axes"));
    if (!picked) return void set(ERROR, "Select an option before adding to cart");
    let qty = Number(f?.get("quantity") ?? el.getAttribute("data-cart-qty") ?? 1);
    const field = el.getAttribute("data-cart-qty-field");
    if (field) {
      const input = el.closest("form, section, body")?.querySelector<HTMLInputElement>('[name="' + field + '"]');
      if (input && Number(input.value) > 0) qty = Number(input.value);
    }
    const line = toCartLine(picked, Math.max(1, Math.floor(qty) || 1));
    if (!line) return void set(ERROR, "This product is not available for purchase");
    set(ERROR, undefined);
    await apply(cart.add(line));
    set(OPEN, "true"); // show what was added, as storefront carts usually do
  };
  const checkout = async (el: Element) => {
    if (!current.items.length) return;
    set(ERROR, undefined);
    try {
      const dest = await cart.checkout(current, {
        successUrl: returnUrl(win, el.getAttribute("data-cart-success"), "success"),
        cancelUrl: returnUrl(win, el.getAttribute("data-cart-cancel"), "cancel"),
        promotionCode: (get("cart:promo") || "").trim() || undefined,
      });
      win.location.assign(dest);
    } catch (e) {
      set(ERROR, e instanceof Error ? e.message : "Checkout didn't start. Try again in a moment.");
    }
  };

  doc.addEventListener("click", (e) => {
    if (isEdit()) return;
    const target = e.target as Element | null;
    const line = target?.closest?.("[data-cart-line]");
    if (line) {
      const id = line.getAttribute("data-cart-price-id")!;
      const qty = current.items.find((l) => l.priceId === id)?.quantity ?? 0;
      const to = { inc: qty + 1, dec: qty - 1, remove: 0 }[line.getAttribute("data-cart-line")!];
      if (to !== undefined) void apply(cart.setQuantity(id, to));
      return;
    }
    const el = target?.closest?.("button[data-cart],a[data-cart]");
    if (!el || el.closest("form[data-cart]")) return;
    const kind = el.getAttribute("data-cart");
    // A link with no drawer on the page is a plain link to the cart page.
    if (kind === "open" && !hasDrawer()) return;
    e.preventDefault();
    if (kind === "open") set(OPEN, truthy(get(OPEN)) ? undefined : "true");
    else if (kind === "checkout") void checkout(el);
    else if (kind === "add") void add(el, el.closest("form"));
  }, { signal });
  doc.addEventListener("submit", (e) => {
    if (isEdit()) return;
    const f = e.target as HTMLFormElement;
    if (f.matches?.("form[data-cart]")) {
      e.preventDefault();
      const kind = f.getAttribute("data-cart");
      if (kind === "add") void add(f, f);
      else if (kind === "checkout") void checkout(f);
    }
  }, { signal });
  return () => {
    ac.abort();
    unsubscribe();
    untrackOverlay(doc, ac);
  };
}
