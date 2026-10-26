import { DISMISS_PREFIX } from "../head/dismiss";

const session = new Set<string>();

function stored(win: Window | null, key: string): boolean {
  if (session.has(key)) return true;
  try {
    return win?.localStorage.getItem(DISMISS_PREFIX + key) != null;
  } catch {
    return false;
  }
}
const hide = (el: HTMLElement) => el.style.setProperty("display", "none", "important");

/** Click on a `[data-dismiss-close]` inside `[data-dismiss="key"]`: hide it and remember. */
export function dismissClick(e: Event) {
  const t = e.target as Element | null;
  if (!t?.closest?.("[data-dismiss-close]")) return;
  const el = t.closest<HTMLElement>("[data-dismiss]");
  const key = el?.getAttribute("data-dismiss");
  if (!el || !key) return;
  hide(el);
  session.add(key);
  try {
    el.ownerDocument.defaultView?.localStorage.setItem(DISMISS_PREFIX + key, "1");
  } catch {
    /* session only */
  }
}

/** Re-hides remembered ones (covers pages without the head snippet and nodes added later). */
export function dismissScan(root: ParentNode, win: Window | null) {
  root.querySelectorAll<HTMLElement>("[data-dismiss]").forEach((el) => {
    const key = el.getAttribute("data-dismiss");
    if (key && stored(win, key)) hide(el);
  });
}
