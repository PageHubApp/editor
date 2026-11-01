import type { RuntimeConfig } from "../config";

/** Handler for one provider; `event` is the part after the colon in `data-track="provider:event"`. */
export type TrackAdapter = (event: string, el: Element) => void;

type Win = Window & { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[]; plausible?: (e: string) => void; fbq?: (...a: unknown[]) => void };

const builtin: Record<string, (w: Win, event: string) => void> = {
  ga4: (w, e) => (w.gtag ? w.gtag("event", e) : w.dataLayer?.push({ event: e })),
  gtm: (w, e) => w.dataLayer?.push({ event: e }),
  plausible: (w, e) => w.plausible?.(e),
  meta: (w, e) => w.fbq?.("trackCustom", e),
};

/** Minor units to the major amount a tag expects, using the currency's own digit count (JPY has 0, USD 2, BHD 3). NaN for an unknown currency. */
function toMajor(minor: number, currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return minor / 10 ** digits;
  } catch {
    return NaN;
  }
}

/**
 * `data-track-purchase` on a hidden element of the confirmation page: `data-id` (the order id), `data-value` (minor
 * units) and `data-currency`. Fires gtag `purchase` and fbq `Purchase` (event id = the order id). The value
 * `lead` (`data-track-purchase="lead"`, a held request, no money taken) fires gtag `generate_lead` only.
 * Once per order and browser (`localStorage` `ph:purchase:<id>`, `ph:lead:<id>`); nothing is sent, or remembered,
 * while no tag is loaded, so a visitor who gives consent later and reloads is still counted.
 */
export function mount(el: Element): void {
  const win = el.ownerDocument.defaultView as Win | null;
  const id = el.getAttribute("data-id");
  if (!win || !id) return;
  const lead = el.getAttribute("data-track-purchase") === "lead";
  const key = (lead ? "ph:lead:" : "ph:purchase:") + id;
  try {
    if (win.localStorage.getItem(key)) return;
  } catch {
    /* storage blocked: send anyway, GA4 and Meta dedupe on the id */
  }
  const currency = (el.getAttribute("data-currency") ?? "").toUpperCase();
  const value = toMajor(Number(el.getAttribute("data-value")), currency);
  let sent = false;
  try {
    if (lead) {
      if (win.gtag) (win.gtag("event", "generate_lead"), (sent = true));
    } else if (Number.isFinite(value)) {
      if (win.gtag) (win.gtag("event", "purchase", { transaction_id: id, value, currency }), (sent = true));
      if (win.fbq) (win.fbq("track", "Purchase", { value, currency }, { eventID: id }), (sent = true));
    }
  } catch {
    /* analytics must never break the page */
  }
  if (!sent) return;
  try {
    win.localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

/** `data-track="ga4:generate_lead"` on a link, button or form: fires on click / submit. Unknown providers do nothing. */
export function init(doc: Document, cfg: RuntimeConfig): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  const win = doc.defaultView as Win;
  const fire = (el: Element | null) => {
    const spec = el?.getAttribute("data-track") ?? "";
    const i = spec.indexOf(":");
    if (!el || i < 1) return;
    const [provider, event] = [spec.slice(0, i), spec.slice(i + 1)];
    try {
      const custom = cfg.track?.adapters?.[provider];
      if (custom) custom(event, el);
      else builtin[provider]?.(win, event);
    } catch {
      /* analytics must never break the page */
    }
  };
  doc.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest?.("a[data-track],button[data-track]");
    fire(el ?? null);
  }, { signal });
  doc.addEventListener("submit", (e) => fire((e.target as Element).closest?.("form[data-track]") ?? null), { signal });
  return () => ac.abort();
}
