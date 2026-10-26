import { set } from "../state-store";

const groups = new Map<string, Map<Element, { value: string; ratio: number }>>();

/** `data-state-in-view="key=value"`: the most visible member of a key's group writes `key`, `key:index`, `key:number`, `key:count`. */
export function mount(el: Element) {
  const win = el.ownerDocument.defaultView!;
  const [key = "", value = ""] = el.getAttribute("data-state-in-view")!.split("=");
  const group = groups.get(key) ?? groups.set(key, new Map()).get(key)!;
  /** Forget members that left the page (a swapped-in region re-creates its markup), so they are never counted twice. */
  const prune = () => {
    for (const m of group.keys()) if (!m.isConnected) group.delete(m);
  };
  prune();
  group.set(el, { value, ratio: 0 });
  const members = () => [...group.keys()].sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
  if (!win.IntersectionObserver) return;
  new win.IntersectionObserver(
    (entries) => {
      prune();
      for (const e of entries) if (group.has(e.target)) group.get(e.target)!.ratio = e.isIntersecting ? e.intersectionRatio : 0;
      let best: Element | undefined;
      let max = 0;
      for (const [m, s] of group) if (s.ratio > max) (max = s.ratio), (best = m);
      if (!best) return;
      const all = members();
      const i = all.indexOf(best);
      set(key, group.get(best)!.value);
      set(key + ":index", String(i));
      set(key + ":number", String(i + 1));
      set(key + ":count", String(all.length));
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  ).observe(el);
}
