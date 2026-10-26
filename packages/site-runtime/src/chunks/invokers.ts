/** Loads the invokers polyfill, but only on browsers without `commandForElement`. `load` is a test seam. */
export async function init(doc: Document, _cfg?: unknown, load: () => Promise<unknown> = () => import("invokers-polyfill")) {
  const win = doc.defaultView;
  if (win && !("commandForElement" in win.HTMLButtonElement.prototype)) await load();
}
