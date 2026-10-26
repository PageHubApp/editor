import { trackOverlay, untrackOverlay } from "../overlays";
import { test } from "../state-store";

const isEdit = (el: Element) => el.ownerDocument.documentElement.hasAttribute("data-ph-edit");

/** Open/close/toggle a show-hide target: a `[popover]` the native way, anything else through the `hidden` class. */
function setOpen(t: HTMLElement, open?: boolean) {
  if (t.hasAttribute("popover")) {
    let now = false;
    try {
      now = t.matches(":popover-open");
    } catch {
      /* no :popover-open: treat as closed */
    }
    const want = open ?? !now;
    if (want !== now) want ? t.showPopover?.() : t.hidePopover?.();
  } else t.classList.toggle("hidden", open === undefined ? !t.classList.contains("hidden") : !open);
}

const forDir = (dir: string | null): boolean | undefined => (dir === "show" ? true : dir === "hide" ? false : undefined);

/**
 * Show-hide triggers the native invoker attributes can't express.
 *  - `data-show-on="load|hover"` + `data-show-target="id"` (default: the element itself) + `data-show-dir="show|hide|toggle"`
 *    + optional `data-show-if` (a state-store `test()` expression; `ls:key` reads raw localStorage). Load fires once on mount when the
 *    gate passes; hover shows on `pointerenter` and reverts on `pointerleave`. Both are off in the editing canvas.
 *  - `data-tab-target="id"` + `data-tab-of="group"`: a click hides every `[data-tab-group="group"]` panel and shows the target. Works in the canvas.
 *  - `[popover="manual"]`: Escape closes the most recently opened one (they never light-dismiss).
 */
export function mount(el: Element) {
  const doc = el.ownerDocument;
  const tab = el.getAttribute("data-tab-target");
  if (tab) {
    const group = el.getAttribute("data-tab-of") || tab;
    el.addEventListener("click", () => {
      doc.querySelectorAll(`[data-tab-group="${group}"]`).forEach((p) => p.classList.add("hidden"));
      doc.getElementById(tab)?.classList.remove("hidden");
    });
  }
  const on = el.getAttribute("data-show-on");
  if (!on || isEdit(el)) return;
  const target = () => (el.getAttribute("data-show-target") ? doc.getElementById(el.getAttribute("data-show-target")!) : (el as HTMLElement));
  const gate = () => {
    const g = el.getAttribute("data-show-if");
    return !g || test(g);
  };
  const dir = forDir(el.getAttribute("data-show-dir"));
  if (on === "load") {
    if (gate()) target() && setOpen(target() as HTMLElement, dir);
  } else if (on === "hover") {
    el.addEventListener("pointerenter", () => {
      if (gate() && target()) setOpen(target() as HTMLElement, dir);
    });
    el.addEventListener("pointerleave", () => {
      if (dir !== undefined && target()) setOpen(target() as HTMLElement, !dir);
    });
  }
}

/**
 * A popover or dialog target starts with the authored `hidden` class. While it is open that class comes off (and goes back on close), the
 * way live's class toggle works, so `hidden` never has to be overridden with CSS and a responsive `lg:hidden` still hides it.
 */
function syncHidden(t: HTMLElement, open: boolean) {
  if (open) {
    if (t.classList.contains("hidden")) {
      t.classList.remove("hidden");
      t.setAttribute("data-ph-was-hidden", "");
    }
  } else if (t.hasAttribute("data-ph-was-hidden")) {
    t.removeAttribute("data-ph-was-hidden");
    t.classList.add("hidden");
  }
}

export function init(doc: Document) {
  const onBeforeToggle = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.hasAttribute?.("popover") || t.localName === "dialog") syncHidden(t, (e as Event & { newState?: string }).newState === "open");
  };
  doc.addEventListener("beforetoggle", onBeforeToggle, true);
  const onToggle = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.getAttribute?.("popover") !== "manual") return;
    if ((e as Event & { newState?: string }).newState === "open") trackOverlay(doc, t, () => t.hidePopover?.());
    else untrackOverlay(doc, t);
  };
  doc.addEventListener("toggle", onToggle, true);
  // `commandfor` / `command` on a NON-button (a gallery tile, a card, the overlay a block authors as a click-away backdrop): the native
  // invoker only covers buttons, so the click runs the command here. An element inside the invoker counts as a click on it; an overlay
  // that commands ITSELF acts only on a click that lands on it (its backdrop), never one bubbling up from its panel.
  const onInvoke = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.("[commandfor]") as HTMLElement | null;
    if (!el || el.localName === "button" || el.localName === "input" || isEdit(el)) return;
    const t = doc.getElementById(el.getAttribute("commandfor")!);
    const cmd = el.getAttribute("command");
    if (!t || !cmd || (t === el && e.target !== el)) return;
    // An invoker with content INSIDE the overlay it names is a panel carrying its overlay's command (a drawer or modal panel): never act,
    // or a click on blank panel space closes it. A childless one (a click-away strip beside a drawer) is a backdrop and still acts.
    if (t !== el && t.contains(el) && el.firstElementChild) return;
    const dialog = t as HTMLDialogElement;
    if (cmd === "show-popover") setOpen(t, true);
    else if (cmd === "hide-popover") setOpen(t, false);
    else if (cmd === "toggle-popover") setOpen(t);
    else if (cmd === "show-modal" && dialog.localName === "dialog" && !dialog.open) dialog.showModal?.();
    else if ((cmd === "close" || cmd === "request-close") && dialog.localName === "dialog") dialog.close?.();
  };
  doc.addEventListener("click", onInvoke);
  return () => {
    doc.removeEventListener("click", onInvoke);
    doc.removeEventListener("beforetoggle", onBeforeToggle, true);
    doc.removeEventListener("toggle", onToggle, true);
  };
}
