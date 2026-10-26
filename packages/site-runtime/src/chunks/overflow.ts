import { parseDuration } from "../duration";

/**
 * Overflow UX, each attribute independent: `data-drag-scroll` (pointer drag), `data-wheel-horizontal` (vertical wheel pans sideways),
 * `data-scrollbar-autohide="1500ms"` (sets `data-scrolling` while scrolling; CSS hides the scrollbar otherwise),
 * `data-scroll-smoothing` (wheel eases toward its target; a number 0-1, default 0.15 per frame).
 */
export function mount(el: Element) {
  const box = el as HTMLElement;
  const win = box.ownerDocument.defaultView!;
  const reduce = () => !!win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const horizontal = box.hasAttribute("data-wheel-horizontal");

  if (box.hasAttribute("data-drag-scroll")) {
    box.addEventListener("pointerdown", (e) => {
      const p = e as PointerEvent;
      if (p.button !== 0 || (p.target as Element).closest?.("a,button,input,select,textarea")) return;
      const startX = p.clientX;
      const startLeft = box.scrollLeft;
      let moved = false;
      const move = (m: Event) => {
        const dx = (m as PointerEvent).clientX - startX;
        if (Math.abs(dx) > 3) moved = true;
        box.scrollLeft = startLeft - dx;
        box.setAttribute("data-dragging", "");
      };
      const end = () => {
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", end);
        win.removeEventListener("pointercancel", end);
        win.removeEventListener("blur", end);
        box.removeAttribute("data-dragging");
        if (moved) box.addEventListener("click", (c) => c.preventDefault(), { once: true, capture: true });
      };
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", end);
      win.addEventListener("pointercancel", end);
      win.addEventListener("blur", end);
    });
  }

  const smoothAttr = box.getAttribute("data-scroll-smoothing");
  const smooth = box.hasAttribute("data-scroll-smoothing") ? Math.min(Math.max(Number(smoothAttr) || 0.15, 0.02), 1) : 0;
  if (horizontal || smooth) {
    let target = 0;
    let raf = 0;
    const horiz = horizontal;
    const frame = () => {
      const pos = horiz ? box.scrollLeft : box.scrollTop;
      const next = pos + (target - pos) * smooth;
      horiz ? (box.scrollLeft = next) : (box.scrollTop = next);
      raf = Math.abs(target - next) > 0.5 ? win.requestAnimationFrame(frame) : 0;
    };
    box.addEventListener(
      "wheel",
      (e) => {
        const w = e as WheelEvent;
        const d = horiz && Math.abs(w.deltaY) >= Math.abs(w.deltaX) ? w.deltaY : horiz ? w.deltaX : w.deltaY;
        const max = horiz ? box.scrollWidth - box.clientWidth : box.scrollHeight - box.clientHeight;
        const cur = horiz ? box.scrollLeft : box.scrollTop;
        if (max <= 0 || (d < 0 && cur <= 0) || (d > 0 && cur >= max)) return;
        e.preventDefault();
        if (!smooth || reduce()) return void (horiz ? (box.scrollLeft += d) : (box.scrollTop += d));
        target = Math.min(Math.max((raf ? target : cur) + d, 0), max);
        raf ||= win.requestAnimationFrame(frame);
      },
      { passive: false },
    );
  }

  if (box.hasAttribute("data-scrollbar-autohide")) {
    const ms = parseDuration(box.getAttribute("data-scrollbar-autohide"), 1500);
    let t: ReturnType<typeof setTimeout>;
    box.addEventListener(
      "scroll",
      () => {
        box.setAttribute("data-scrolling", "");
        clearTimeout(t);
        t = setTimeout(() => box.removeAttribute("data-scrolling"), ms);
      },
      { passive: true },
    );
  }
}
