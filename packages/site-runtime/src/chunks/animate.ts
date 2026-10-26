let io: IntersectionObserver | undefined;

const preset = (el: Element) => el.getAttribute("data-animate") || "fade-in";
const reveal = (el: Element) => {
  const exit = el.getAttribute("data-animate-exit");
  if (exit) el.classList.remove("animate-css-" + exit);
  el.setAttribute("data-animated", "");
  el.classList.add("animate-css-" + preset(el));
};
const leave = (el: Element) => {
  const exit = el.getAttribute("data-animate-exit")!;
  el.classList.remove("animate-css-" + preset(el));
  void (el as HTMLElement).offsetWidth;
  el.classList.add("animate-css-" + exit);
};

/**
 * `data-animate="fade-up"`: play the preset once when the element scrolls into view (`data-animate-trigger="load"`: immediately).
 * `data-animate-stagger="80ms"` on the parent delays each animated child by one step more. `data-animate-exit="fade-out"` plays that
 * preset when the element scrolls back out, and the entrance again on return. The stylesheet hides it only under `html[data-runtime]`.
 */
export function mount(el: Element) {
  const win = el.ownerDocument.defaultView!;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return el.setAttribute("data-animated", "");
  const step = parseFloat(el.parentElement?.getAttribute("data-animate-stagger") ?? "");
  if (step > 0) {
    const ms = /\ds\s*$/.test(el.parentElement!.getAttribute("data-animate-stagger")!) ? step * 1000 : step;
    (el as HTMLElement).style.animationDelay = [...el.parentElement!.children].filter((c) => c.hasAttribute("data-animate")).indexOf(el) * ms + "ms";
  }
  const exit = el.hasAttribute("data-animate-exit");
  if (el.getAttribute("data-animate-trigger") === "load" && !exit) return reveal(el);
  if (!win.IntersectionObserver) return reveal(el);
  io ??= new win.IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const t = e.target;
        const animated = t.hasAttribute("data-animated");
        if (e.isIntersecting) {
          if (!t.hasAttribute("data-animate-exit")) io!.unobserve(t);
          if (!animated || t.classList.contains("animate-css-" + t.getAttribute("data-animate-exit"))) reveal(t);
        } else if (animated && t.hasAttribute("data-animate-exit")) leave(t);
      }
    },
    { threshold: 0.15 },
  );
  io.observe(el);
  if (el.getAttribute("data-animate-trigger") === "load") reveal(el);
}
