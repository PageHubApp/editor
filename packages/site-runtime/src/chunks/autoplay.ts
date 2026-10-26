import { parseDuration } from "../duration";

/** `data-autoplay="5s"` on a scroll-snap track: step one item per tick, wrap at the end. */
export function mount(el: Element) {
  const track = el as HTMLElement;
  const win = track.ownerDocument.defaultView!;
  const ms = Math.max(parseDuration(track.getAttribute("data-autoplay"), 5000), 500);
  let hover = false;
  track.addEventListener("pointerenter", () => (hover = true));
  track.addEventListener("pointerleave", () => (hover = false));
  const timer = setInterval(() => {
    if (!track.isConnected) return clearInterval(timer);
    if (hover || track.matches(":focus-within") || track.ownerDocument.hidden) return;
    if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const [a, b] = [track.children[0] as HTMLElement | undefined, track.children[1] as HTMLElement | undefined];
    if (!a) return;
    const step = (b ? b.offsetLeft - a.offsetLeft : 0) || a.offsetWidth;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    track.scrollLeft = atEnd ? 0 : track.scrollLeft + step;
  }, ms);
}
