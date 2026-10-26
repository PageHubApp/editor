/** `data-scrollspy` on a nav: `aria-current="true"` on the link whose `#target` is most visible. */
export function mount(el: Element) {
  const win = el.ownerDocument.defaultView!;
  const doc = el.ownerDocument;
  const links = new Map<Element, HTMLAnchorElement>();
  el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    const t = a.hash.length > 1 && doc.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (t) links.set(t, a);
  });
  if (!win.IntersectionObserver) return;
  const ratios = new Map<Element, number>();
  const io = new win.IntersectionObserver(
    (entries) => {
      for (const e of entries) ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
      let best: Element | undefined;
      let max = 0;
      for (const [t, r] of ratios) if (r > max) (max = r), (best = t);
      if (!best) return;
      links.forEach((a, t) => (t === best ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  links.forEach((_, t) => io.observe(t));
}
