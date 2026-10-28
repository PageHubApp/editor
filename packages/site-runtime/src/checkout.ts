/**
 * The default cart's checkout, loaded only when a buyer checks out: the session request, and Stripe's payment form in
 * the page for a site that can take payment there.
 */
import type { Cart, CheckoutOptions } from "./chunks/cart";
import { set } from "./state-store";

/** What checkout returns when the payment form shows in the page instead of on the payment provider's own page. */
export interface EmbeddedPay {
  clientSecret: string;
  publishableKey: string;
  /** The site's connected account the payment belongs to. */
  stripeAccount: string;
}

/**
 * POSTs the lines (plus `body`) to `api`. Resolves to the URL to send the buyer to, or the payment form to show when
 * the page has a `[data-cart-pay]` spot and the site can take payment in the page.
 */
export async function requestCheckout(
  win: Window,
  api: string,
  body: Record<string, unknown> | undefined,
  cart: Cart,
  o: CheckoutOptions
): Promise<string | EmbeddedPay> {
  let d: any = null;
  try {
    const r = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...body,
        items: cart.items.map((l) => ({ priceId: l.priceId, quantity: l.quantity })),
        successUrl: o.successUrl,
        cancelUrl: o.cancelUrl,
        promotionCode: o.promotionCode || undefined,
        details: o.details,
        embedded: !!win.document.querySelector("[data-cart-pay]") || undefined,
      }),
    });
    d = await r.json().catch(() => null);
  } catch {
    throw new Error("Couldn't reach checkout. Check your connection and try again.");
  }
  if (d?.clientSecret) return d as EmbeddedPay;
  if (d?.url) return String(d.url);
  if (d?.code === "invalid_promo") set("cart:promo-invalid", d.error || "That promo code isn't valid");
  throw new Error(d?.error || "Checkout didn't start. Try again in a moment.");
}

/** Stripe.js, pinned to the version whose `createEmbeddedCheckoutPage` matches the session's `ui_mode: "embedded_page"`. */
const STRIPE_JS = "https://js.stripe.com/endive/stripe.js";

let loading: Promise<any> | null = null;
let mounted: { destroy(): void } | null = null;

function stripeJs(win: Window): Promise<any> {
  const w = win as any;
  if (w.Stripe) return Promise.resolve(w.Stripe);
  loading ??= new Promise((resolve, reject) => {
    const s = win.document.createElement("script");
    s.src = STRIPE_JS;
    s.onload = () => (w.Stripe ? resolve(w.Stripe) : reject(new Error("no Stripe")));
    s.onerror = () => {
      loading = null;
      reject(new Error("no Stripe"));
    };
    win.document.head.appendChild(s);
  });
  return loading;
}

/**
 * Shows Stripe's payment form in `[data-cart-pay]` and opens the `<dialog>` around it, if any. Closing that dialog
 * removes the form, so the next checkout starts a fresh one. On payment Stripe sends the buyer to the session's
 * return page (`?checkout=success`), the same landing as the hosted page.
 */
export async function mountPay(win: Window, pay: EmbeddedPay): Promise<void> {
  const el = win.document.querySelector<HTMLElement>("[data-cart-pay]");
  if (!el || !pay.clientSecret || !pay.publishableKey || !pay.stripeAccount) throw new Error("Checkout didn't start. Try again in a moment.");
  let Stripe: any;
  try {
    Stripe = await stripeJs(win);
  } catch {
    throw new Error("The payment form didn't load. Check your connection and try again.");
  }
  mounted?.destroy();
  el.replaceChildren();
  const stripe = Stripe(pay.publishableKey, { stripeAccount: pay.stripeAccount });
  const checkout = await stripe.createEmbeddedCheckoutPage({ fetchClientSecret: async () => pay.clientSecret });
  checkout.mount(el);
  mounted = checkout;
  const dialog = el.closest("dialog");
  if (dialog && !dialog.open) dialog.showModal();
  dialog?.addEventListener(
    "close",
    () => {
      if (mounted !== checkout) return;
      checkout.destroy();
      mounted = null;
    },
    { once: true }
  );
}
