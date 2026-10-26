// Mirrors the Speculation Rules exclusions the page head ships (account, cart, api, query strings).
const SKIP = /^\/(?:account|cart|api)(?:\/|$)/;

/**
 * Safari and Firefox have no Speculation Rules, so warm a same-origin page with `<link rel=prefetch>` once the pointer
 * rests on its link (65 ms) or a finger lands on it. Once per URL; off under Save-Data and on 2g.
 */
export function prefetchOnIntent(doc: Document, signal: AbortSignal, skip: () => boolean) {
  const win = doc.defaultView;
  if (!win || (win as any).HTMLScriptElement?.supports?.("speculationrules")) return;
  const net = (win.navigator as any).connection;
  if (net?.saveData || /2g$/.test(net?.effectiveType ?? "")) return;
  const done = new Set<string>();
  const here = win.location;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const target = (e: Event): string | null => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || skip() || a.hasAttribute("download") || a.matches("[rel~=nofollow],[data-no-prerender]") || (a.target && a.target !== "_self")) return null;
    if (!/^https?:$/.test(a.protocol) || a.origin !== here.origin || a.search || SKIP.test(a.pathname) || (a.pathname === here.pathname && !here.search)) return null;
    return done.has(a.href) ? null : a.href;
  };
  const warm = (href: string) => {
    done.add(href);
    const l = doc.createElement("link");
    l.rel = "prefetch";
    l.href = href;
    doc.head.append(l);
  };

  doc.addEventListener("mouseover", (e) => {
    clearTimeout(timer);
    const href = target(e);
    if (href) timer = setTimeout(() => warm(href), 65);
  }, { signal });
  doc.addEventListener("mouseout", () => clearTimeout(timer), { signal });
  doc.addEventListener("touchstart", (e) => {
    const href = target(e);
    if (href) warm(href);
  }, { signal, passive: true });
}
