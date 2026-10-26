type Mode = "oneline" | "multiline" | "box" | "boxoneline";

/**
 * `data-fit-text`: binary-search the largest font-size (px, between `data-fit-min` 4 and `data-fit-max` 512) that fits.
 * `oneline`: one line, element width. `boxoneline`: one line inside the element's own box. `box`: wrapped, inside the element's own box.
 * `multiline`: wrapped, inside the parent's height. Re-fits when the parent resizes. Without JS the text keeps its CSS size.
 */
export function mount(el: Element) {
  const node = el as HTMLElement;
  const win = node.ownerDocument.defaultView!;
  const mode = (node.getAttribute("data-fit-text") || "oneline") as Mode;
  const [lo0, hi0] = [Number(node.getAttribute("data-fit-min")) || 4, Number(node.getAttribute("data-fit-max")) || 512];
  const nowrap = mode === "oneline" || mode === "boxoneline";
  let pending = 0;
  const fits = () => {
    const wide = node.scrollWidth <= node.clientWidth + 0.5;
    if (mode === "oneline") return wide;
    if (mode === "multiline") return wide && node.offsetHeight <= (node.parentElement?.clientHeight || Infinity);
    return wide && node.scrollHeight <= node.clientHeight + 0.5;
  };
  const fit = () => {
    pending = 0;
    if (nowrap) node.style.whiteSpace = "nowrap";
    let [lo, hi] = [lo0, hi0];
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      node.style.fontSize = mid + "px";
      fits() ? (lo = mid) : (hi = mid);
    }
    node.style.fontSize = lo + "px";
  };
  const queue = () => (pending ||= win.requestAnimationFrame(fit));
  fit();
  if (node.parentElement && win.ResizeObserver) new win.ResizeObserver(queue).observe(node.parentElement);
  else win.addEventListener("resize", queue);
  (node.ownerDocument as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(queue);
}
