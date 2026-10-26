/** Backdrop click closes `dialog[closedby="any"]` where the browser doesn't do it natively. */
export function closedbyClick(e: MouseEvent) {
  const d = e.target as HTMLDialogElement | null;
  if (!d || d.tagName !== "DIALOG" || d.getAttribute("closedby") !== "any" || !d.open) return;
  const proto = d.ownerDocument.defaultView?.HTMLDialogElement?.prototype;
  if (proto && "closedBy" in proto) return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
}
