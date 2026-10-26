/**
 * `data-scroll-effect="horizontal|timeline"` on a section. Layout: section > pin > track (the first child of the first child).
 * The section is `runway` screens tall (`data-scroll-runway`, default 3), the pin sticks for that distance, and scroll progress (0 to 1) drives:
 * `horizontal`: the track pans sideways by `speed` x its overflow (`data-scroll-speed`, default 1; `data-scroll-direction="reverse"` pans the other way);
 * `timeline`: the CSS variable `--scroll-progress` on the section, for any CSS to use (`calc()`, `animation-delay` with a paused animation).
 * `data-scroll-smoothing` (0-1, default 0) eases the position toward the target each frame. Reduced motion: no pin, the pin scrolls sideways natively.
 */
export function mount(el: Element) {
  const section = el as HTMLElement;
  const win = section.ownerDocument.defaultView!;
  const pin = section.firstElementChild as HTMLElement | null;
  const track = pin?.firstElementChild as HTMLElement | null | undefined;
  const mode = section.getAttribute("data-scroll-effect");
  if (!pin) return;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    if (mode === "horizontal") pin.style.overflowX = "auto";
    return;
  }
  const num = (n: string, d: number) => {
    const v = parseFloat(section.getAttribute(n) ?? "");
    return isNaN(v) ? d : v;
  };
  const [runway, speed] = [Math.max(num("data-scroll-runway", 3), 1), num("data-scroll-speed", 1)];
  const smooth = Math.min(Math.max(num("data-scroll-smoothing", 0), 0), 0.98);
  const sign = /reverse|rtl|left/.test(section.getAttribute("data-scroll-direction") ?? "") ? -1 : 1;
  section.style.height = runway * 100 + "vh";
  Object.assign(pin.style, { position: "sticky", top: "0", height: "100vh", overflow: "hidden" });
  if (track && mode === "horizontal") track.style.willChange = "transform";

  let target = 0;
  let cur = 0;
  let raf = 0;
  const paint = () => {
    if (mode === "horizontal" && track) {
      const span = Math.max(track.scrollWidth - pin.clientWidth, 0) * speed;
      track.style.transform = `translate3d(${-cur * span * sign}px,0,0)`;
    } else section.style.setProperty("--scroll-progress", cur.toFixed(4));
  };
  const frame = () => {
    cur += (target - cur) * (1 - smooth);
    if (Math.abs(target - cur) < 0.0005) cur = target;
    paint();
    raf = cur === target ? 0 : win.requestAnimationFrame(frame);
  };
  const update = () => {
    const r = section.getBoundingClientRect();
    const range = r.height - win.innerHeight;
    target = range > 0 ? Math.min(Math.max(-r.top / range, 0), 1) : 0;
    if (!smooth) ((cur = target), paint());
    else raf ||= win.requestAnimationFrame(frame);
  };
  win.addEventListener("scroll", update, { passive: true });
  win.addEventListener("resize", update);
  update();
}
