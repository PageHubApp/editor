/**
 * Small click behaviours native HTML has no attribute for; each is one data attribute on the element that is clicked.
 *  - `data-close-link="<selector>"` on an overlay (popover or dialog): a click on a matching element inside closes it (`a` for a link).
 *  - `data-print="page"` prints the page; any other value is a selector for the closest ancestor to mark `ph-print` while printing (a coupon).
 *  - `data-scroll-by="<id>"` + `data-scroll-step="-1|1"`: scrolls that element by its own width (a track's prev / next).
 *  - `data-set-field="<selector>"` + `data-set-value`: sets a field and fires `input` / `change` (a link that presets a form's select).
 *  - `data-key-click`: Enter or Space on the element clicks it (a div acting as a button).
 *  - `data-tab-target` with an `aria-expanded`: the click sets `aria-expanded` true on this tab and false on the rest of its `data-tab-of` group.
 */
function close(el: HTMLElement) {
  if (el.hasAttribute("popover")) {
    let open = false;
    try {
      open = el.matches(":popover-open");
    } catch {
      /* no :popover-open: treat as closed */
    }
    if (open) el.hidePopover?.();
  } else if (el.localName === "dialog") (el as HTMLDialogElement).close?.();
  else el.classList.add("hidden");
}

export function mount(el: Element) {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const attr = (n: string) => el.getAttribute(n);

  if (el.hasAttribute("data-close-link")) {
    el.addEventListener("click", (e) => {
      const hit = (e.target as Element).closest?.(el.getAttribute("data-close-link") || "a");
      if (hit && el.contains(hit)) close(el as HTMLElement);
    });
  }

  const print = attr("data-print");
  if (print) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const scope = print === "page" ? null : el.closest(print);
      if (scope) {
        scope.classList.add("ph-print");
        win.addEventListener("afterprint", () => scope.classList.remove("ph-print"), { once: true });
      }
      win.print();
    });
  }

  const scrollBy = attr("data-scroll-by");
  if (scrollBy) {
    el.addEventListener("click", () => {
      const t = doc.getElementById(scrollBy);
      const smooth = !win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      t?.scrollBy?.({ left: (Number(attr("data-scroll-step")) || 1) * t.clientWidth, behavior: smooth ? "smooth" : "auto" });
    });
  }

  const field = attr("data-set-field");
  if (field) {
    el.addEventListener("click", () => {
      const f = doc.querySelector<HTMLInputElement>(field);
      if (!f) return;
      f.value = attr("data-set-value") ?? "";
      for (const type of ["input", "change"]) f.dispatchEvent(new win.Event(type, { bubbles: true }));
    });
  }

  if (el.hasAttribute("data-key-click")) {
    el.addEventListener("keydown", (e) => {
      const k = e as KeyboardEvent;
      if (e.target !== el || (k.key !== "Enter" && k.key !== " ")) return;
      e.preventDefault();
      (el as HTMLElement).click();
    });
  }

  if (el.hasAttribute("data-tab-target") && el.hasAttribute("aria-expanded")) {
    const group = attr("data-tab-of") || attr("data-tab-target")!;
    el.addEventListener("click", () => {
      doc.querySelectorAll(`[data-tab-of="${group}"][aria-expanded]`).forEach((t) => t.setAttribute("aria-expanded", t === el ? "true" : "false"));
    });
  }
}
