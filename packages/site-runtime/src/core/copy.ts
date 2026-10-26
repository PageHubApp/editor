/** Click on `[data-copy]`: copy its value (or its text if the value is empty), flag `data-copied` for 2 s. */
export function copyClick(e: Event) {
  const el = (e.target as Element | null)?.closest?.("[data-copy]");
  if (!el) return;
  const text = el.getAttribute("data-copy") || el.textContent || "";
  const nav = el.ownerDocument.defaultView?.navigator;
  Promise.resolve(nav?.clipboard?.writeText(text)).then(
    () => {
      el.setAttribute("data-copied", "");
      setTimeout(() => el.removeAttribute("data-copied"), 2000);
    },
    () => {},
  );
}
