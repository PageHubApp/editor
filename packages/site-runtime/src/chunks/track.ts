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
