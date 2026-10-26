/**
 * `data-carousel="dots arrows wrap"` on a scroll-snap track: prev / next buttons and one dot per slide, placed in a
 * `[data-carousel-nav]` after the track. `wrap` loops past either end. Controls the author already placed in the
 * track's parent (`[data-carousel-prev]`, `[data-carousel-next]`, `[data-carousel-dot]`, one dot per slide in order)
 * are wired the same way; the current dot gets `aria-current="true"`. A value with no `dots` / `arrows` token builds nothing.
 * `overlay` lays the generated controls over the slides (arrows at the sides, dots along the bottom edge, light on a
 * dark disc so they read on a photo) instead of in a bar under the track: a hero slider's look.
 *
 * The generated nav ships its own default look as one `<style id="ph-carousel-style">`, added the first time a nav is built
 * (the map chunk does the same for its badge). Every rule sits in `:where()`, so it has no specificity: any class or rule
 * on the page wins. The colours are the site's theme tokens (`--color-primary`, `--color-base-content`). Controls the
 * author placed are never styled here.
 */
const STYLE_ID = "ph-carousel-style";
const FG = "var(--color-base-content, var(--base-content, currentColor))";
const ACCENT = "var(--color-primary, var(--primary, currentColor))";
const NAV = ":where([data-carousel-nav])";
const OVER = `${NAV}:where([data-carousel-overlay])`;
/** A button rule. `button:where(...)` weighs one element, the same as the page's own `button { border-radius: 0 }` reset, and comes later, so it wins over the reset and loses to any class. */
const rule = (sel: string) => `${NAV} button:where(${sel})`;
const ARROWS = "[data-carousel-prev],[data-carousel-next]";
const CSS = [
  `${NAV}{display:flex;align-items:center;justify-content:center;gap:.75rem;padding-block:.75rem}`,
  `${NAV} :where([data-carousel-dots]){display:flex;align-items:center;gap:.5rem}`,
  `${rule("[data-carousel-dot]")}{position:relative;width:.625rem;height:.625rem;padding:0;border:0;border-radius:9999px;cursor:pointer;background:color-mix(in oklab,${FG} 30%,transparent);transition:background-color .2s,transform .2s}`,
  `${rule("[data-carousel-dot]")}::after{content:"";position:absolute;inset:-.5rem}`,
  `${rule("[data-carousel-dot]:hover")}{background:color-mix(in oklab,${FG} 55%,transparent)}`,
  `${rule('[data-carousel-dot][aria-current="true"]')}{background:${ACCENT};transform:scale(1.3)}`,
  `${rule(ARROWS)}{display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;border:1px solid color-mix(in oklab,${FG} 18%,transparent);border-radius:9999px;cursor:pointer;color:${FG};background:color-mix(in oklab,${FG} 6%,transparent);transition:background-color .2s}`,
  `${rule("[data-carousel-prev]:hover,[data-carousel-next]:hover")}{background:color-mix(in oklab,${FG} 14%,transparent)}`,
  `${NAV} :where(svg){width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}`,
  `${rule(":focus-visible")}{outline:2px solid ${ACCENT};outline-offset:2px}`,
  `${OVER}{position:absolute;padding:0;pointer-events:none;z-index:2}`,
  `${OVER} :where([data-carousel-dots]){position:absolute;bottom:1rem;left:50%;transform:translateX(-50%);pointer-events:auto}`,
  `${OVER} button:where([data-carousel-dot]){background:rgb(255 255 255/.5);box-shadow:0 0 0 1px rgb(0 0 0/.2)}`,
  `${OVER} button:where([data-carousel-dot][aria-current="true"]){background:#fff}`,
  `${OVER} button:where(${ARROWS}){position:absolute;top:50%;transform:translateY(-50%);pointer-events:auto;color:#fff;background:rgb(0 0 0/.35);border-color:rgb(255 255 255/.35)}`,
  `${OVER} button:where([data-carousel-prev]:hover,[data-carousel-next]:hover){background:rgb(0 0 0/.55)}`,
  `${OVER} button:where([data-carousel-prev]){left:1rem}`,
  `${OVER} button:where([data-carousel-next]){right:1rem}`,
  `@media (prefers-reduced-motion:reduce){${rule("*")}{transition:none}}`,
].join("\n");
const CHEVRON = { prev: "M15 6l-6 6l6 6", next: "M9 6l6 6l-6 6" };
const arrowIcon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

export function mount(el: Element) {
  const track = el as HTMLElement;
  const doc = track.ownerDocument;
  const win = doc.defaultView!;
  const tokens = (track.getAttribute("data-carousel") || "dots arrows").split(/\s+/);
  const wrap = tokens.includes("wrap");
  const own = (sel: string) => [...(track.parentElement?.querySelectorAll<HTMLElement>(sel) ?? [])];
  const slides = () => [...track.children] as HTMLElement[];
  const nav = doc.createElement("div");
  nav.setAttribute("data-carousel-nav", "");
  const btn = (attr: string, label: string, icon: string, onClick: () => void) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.setAttribute(attr, "");
    b.setAttribute("aria-label", label);
    if (icon) b.innerHTML = icon;
    b.addEventListener("click", onClick);
    return b;
  };
  const current = () => {
    const x = track.scrollLeft;
    let best = 0;
    slides().forEach((s, i) => Math.abs(s.offsetLeft - track.offsetLeft - x) < Math.abs(slides()[best]!.offsetLeft - track.offsetLeft - x) && (best = i));
    return best;
  };
  const go = (i: number) => {
    const s = slides();
    const t = s[wrap ? (i + s.length) % s.length : Math.max(0, Math.min(s.length - 1, i))];
    if (!t) return;
    const left = t.offsetLeft - track.offsetLeft;
    const smooth = !win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo ? track.scrollTo({ left, behavior: smooth ? "smooth" : "auto" }) : (track.scrollLeft = left);
  };
  const dots: HTMLElement[] = own("[data-carousel-dot]");
  dots.forEach((d, i) => d.addEventListener("click", () => go(i)));
  own("[data-carousel-prev]").forEach(b => b.addEventListener("click", () => go(current() - 1)));
  own("[data-carousel-next]").forEach(b => b.addEventListener("click", () => go(current() + 1)));
  const arrows = tokens.includes("arrows");
  if (arrows) nav.append(btn("data-carousel-prev", "Previous slide", arrowIcon(CHEVRON.prev), () => go(current() - 1)));
  if (tokens.includes("dots")) {
    const group = doc.createElement("div");
    group.setAttribute("data-carousel-dots", "");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Choose a slide");
    slides().forEach((_, i) => {
      const d = btn("data-carousel-dot", `Go to slide ${i + 1}`, "", () => go(i));
      dots.push(d);
      group.append(d);
    });
    nav.append(group);
  }
  if (arrows) nav.append(btn("data-carousel-next", "Next slide", arrowIcon(CHEVRON.next), () => go(current() + 1)));
  const mark = () => {
    const c = current();
    dots.forEach((d, i) => (i === c ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
  };
  track.addEventListener("scroll", mark, { passive: true });
  if (nav.childElementCount) {
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      doc.head.append(style);
    }
    track.after(nav);
    if (tokens.includes("overlay")) overlay(track, nav);
  }
  mark();
}

/** Lay the nav over the track's own box (its parent may hold more than the track), and keep it there as it resizes. */
function overlay(track: HTMLElement, nav: HTMLElement) {
  const win = track.ownerDocument.defaultView!;
  nav.setAttribute("data-carousel-overlay", "");
  const parent = track.parentElement;
  if (parent && ["", "static"].includes(win.getComputedStyle(parent).position)) parent.style.position = "relative";
  const place = () => {
    Object.assign(nav.style, { top: `${track.offsetTop}px`, left: `${track.offsetLeft}px`, width: `${track.offsetWidth}px`, height: `${track.offsetHeight}px` });
  };
  place();
  if (win.ResizeObserver) new win.ResizeObserver(place).observe(track);
}
