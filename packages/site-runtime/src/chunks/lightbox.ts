/**
 * A photo lightbox over a grid. The overlay is an ordinary `popover="manual"` (or `<dialog>`) with an `<img>` and an optional caption;
 * these attributes fill it.
 *  - `data-lightbox="<overlay id>"` on a grid tile: a click shows that tile's photo in the overlay (the tile also carries the
 *    `commandfor` / `command="show-popover"` that opens it). The grid is the tile's parent; the tiles are its children that hold an `<img>`.
 *  - `data-lightbox-step="-1|1"` + `data-lightbox-grid="<grid id>"` on a button in the overlay: previous / next tile, wrapping.
 *  - `data-lightbox-caption="<id>"`: the element that gets the photo's alt text.
 * The overlay keeps the current tile number in `data-idx`. A Cloudflare Images URL is swapped to its 1600px variant.
 */
const FULL = /\/[^/]*$/;

export function mount(el: Element) {
  const doc = el.ownerDocument;
  const step = Number(el.getAttribute("data-lightbox-step")) || 0;
  el.addEventListener("click", () => {
    const overlay = doc.getElementById(el.getAttribute("data-lightbox")!);
    const grid = step ? doc.getElementById(el.getAttribute("data-lightbox-grid") || "") : el.parentElement;
    if (!overlay || !grid) return;
    const tiles = [...grid.children].filter((c) => c.querySelector("img"));
    const n = tiles.length;
    if (!n) return;
    const from = step ? parseInt(overlay.getAttribute("data-idx") || "0", 10) : Math.max(0, tiles.findIndex((t) => t === el || t.contains(el)));
    const i = step ? (((from + step) % n) + n) % n : from;
    overlay.setAttribute("data-idx", String(i));
    const src = tiles[i]!.querySelector("img")!;
    const img = overlay.querySelector("img");
    if (img) {
      const url = src.currentSrc || src.src;
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.src = url.includes("imagedelivery.net") ? url.replace(FULL, "/w=1600") : url;
      img.alt = src.alt || "";
    }
    const cap = doc.getElementById(el.getAttribute("data-lightbox-caption") || "");
    if (cap) cap.textContent = src.alt || "";
  });
}
