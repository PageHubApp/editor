import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { after } from "node:test";

GlobalRegistrator.register({ url: "https://example.test/", settings: { handleDisabledFileLoadingAsSuccess: true } });
after(() => GlobalRegistrator.unregister());

/** Fresh page body/head and storage between tests. */
export function resetDom(html = "") {
  document.documentElement.removeAttribute("data-runtime");
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = "";
  document.body.innerHTML = html;
  localStorage.clear();
}
export const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));
export function fire(el: Element, type: string, init: Record<string, unknown> = {}) {
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init }));
}
