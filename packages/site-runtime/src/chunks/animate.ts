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

/** Painted in the viewport (not a closed dialog's zero-size content). */
const onScreen = (el: Element) => {
  const r = el.getBoundingClientRect();
  return (r.width > 0 || r.height > 0) && r.bottom > 0 && r.top < el.ownerDocument.defaultView!.innerHeight;
};

/**
 * The page painted before this chunk loaded, so whatever is on screen now has already been seen: it stays as it is
 * instead of hiding and replaying (a flash). Only then does `html[data-animate-ready]` let the stylesheet hide the
 * rest, all of it off screen. `data-animate-trigger="load"` elements are the exception: the stylesheet hides them from
 * the first paint, and `mount` plays them.
 */
export function init(doc: Document) {
  for (const el of doc.querySelectorAll("[data-animate]")) {
    if (el.getAttribute("data-animate-trigger") !== "load" && onScreen(el)) el.setAttribute("data-animated", "");
  }
  doc.documentElement.setAttribute("data-animate-ready", "");
}

/**
 * `data-animate="fade-up"`: play the preset once when the element scrolls into view (`data-animate-trigger="load"`: immediately).
 * `data-animate-stagger="80ms"` on the parent delays each animated child by one step more. `data-animate-exit="fade-out"` plays that
 * preset when the element scrolls back out, and the entrance again on return. An element `init` found on screen is already shown.
 */
export function mount(el: Element) {
  const win = el.ownerDocument.defaultView!;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return el.setAttribute("data-animated", "");
  if (el.hasAttribute("data-animated") && !el.hasAttribute("data-animate-exit")) return;
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
