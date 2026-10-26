import { hub } from "../hub";

const OPTS = new Set(["once", "passive", "capture", "prevent"]);

/**
 * `data-on="click:openChat; mouseenter:preview.once"`: calls a function the site registered with
 * `PageHub.on(name, fn)` from its own script. Never evaluates code; an unknown name is a console warning.
 */
export function mount(el: Element) {
  const win = el.ownerDocument.defaultView!;
  for (const entry of (el.getAttribute("data-on") || "").split(";")) {
    const i = entry.indexOf(":");
    if (i < 1) continue;
    const type = entry.slice(0, i).trim();
    const parts = entry.slice(i + 1).trim().split(".");
    const opts = new Set<string>();
    while (parts.length > 1 && OPTS.has(parts[parts.length - 1]!)) opts.add(parts.pop()!);
    const name = parts.join(".");
    el.addEventListener(
      type,
      (e) => {
        if (opts.has("prevent")) e.preventDefault();
        const fn = hub(win).fns[name];
        fn ? fn(e, el) : console.warn(`[site-runtime] data-on: no function "${name}" registered (PageHub.on("${name}", fn))`);
      },
      { once: opts.has("once"), passive: opts.has("passive"), capture: opts.has("capture") },
    );
  }
}
