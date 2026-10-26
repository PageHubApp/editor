import { parseDuration } from "../duration";
import { runStateAction } from "../state-action";
import { get, getPath, notify, readFieldsWith, set, subscribe, test } from "../state-store";

/**
 * A form control's current value, for a `field:<name>` key: the control named `<name>` (else the element with that
 * id or `data-anchor`). A checkbox counts only while ticked (its value, or "true"); a radio group is its ticked
 * option. Read live from the page, never cached, so a gate on it follows what the visitor types or picks.
 */
function fieldValue(name: string): string | undefined {
  const esc = name.replace(/["\\]/g, "\\$&");
  const named = [...document.querySelectorAll<HTMLInputElement>(`[name="${esc}"]`)];
  const els = named.length ? named : [...document.querySelectorAll<HTMLInputElement>(`[id="${esc}"],[data-anchor="${esc}"]`)];
  const ticks = els.filter((e) => e.type === "checkbox" || e.type === "radio");
  if (ticks.length) {
    const on = ticks.find((e) => e.checked);
    return on ? on.value || "true" : undefined;
  }
  const v = els[0] && ("value" in els[0] ? els[0].value : els[0].textContent);
  return v || undefined;
}

let watching = false;
/** A page that gates on a form field: install the reader, and re-test every gate while the visitor types or picks. */
function watchFields() {
  if (watching) return;
  watching = true;
  readFieldsWith(fieldValue);
  document.addEventListener("input", notify, true);
  document.addEventListener("change", notify, true);
}

function paint(el: Element) {
  const show = el.getAttribute("data-state-show");
  if (show != null) (el as HTMLElement).hidden = !test(show);
  const text = el.getAttribute("data-state-text");
  if (text != null) el.textContent = getPath(text.trim());
  // An image whose src carries `{{state.<token>}}`s (the matched variant's picture): swap while every token has a value, else keep the rendered src.
  const src = el.getAttribute("data-state-src");
  if (src != null) {
    let empty = false;
    const next = src.replace(/\{\{\s*state\.([^}\s|]+)\s*\}\}/g, (_m, token: string) => {
      const v = getPath(token);
      if (!v) empty = true;
      return v;
    });
    if (!el.hasAttribute("data-state-src-initial")) el.setAttribute("data-state-src-initial", el.getAttribute("src") ?? "");
    const was = el.getAttribute("data-state-src-initial")!;
    const want = empty || !next ? was : next;
    if (want && el.getAttribute("src") !== want) {
      el.removeAttribute("srcset");
      el.setAttribute("src", want);
    }
  }
  const cls = el.getAttribute("data-state-class");
  if (cls != null) {
    const on = new Set<string>();
    const all = new Set<string>();
    for (const entry of cls.split(";")) {
      // `test=>classes` takes any `test()` expression (colon-namespaced keys, `&&` / `||`); `test:classes` is the short form for one atom.
      const arrow = entry.indexOf("=>");
      const m = arrow < 0 ? /^\s*(!?(?:local:|url:)?[\w.-]+(?:(?:!=|>=|<=|=|>|<)[^:]*)?):(.*)$/.exec(entry) : [entry, entry.slice(0, arrow).trim(), entry.slice(arrow + 2)];
      if (!m) continue;
      const names = m[2]!.split(/\s+/).filter(Boolean);
      names.forEach((c) => all.add(c));
      if (test(m[1]!)) names.forEach((c) => on.add(c));
    }
    all.forEach((c) => el.classList.toggle(c, on.has(c)));
  }
}

function bind(el: Element) {
  const input = el as HTMLInputElement;
  const key = el.getAttribute("data-state-bind")!.trim();
  const checked = el.getAttribute("data-bind-mode") === "checked";
  const ms = parseDuration(el.getAttribute("data-debounce"), 0);
  const read = () => (checked ? (input.checked ? input.value || "true" : undefined) : input.value);
  const write = () => {
    set(key, read());
    if (key.startsWith("url:")) {
      const u = new URL(location.href);
      const v = get(key);
      v ? u.searchParams.set(key.slice(4), v) : u.searchParams.delete(key.slice(4));
      history.replaceState(history.state, "", u);
    }
  };
  const cur = get(key);
  if (cur !== undefined) checked ? (input.checked = cur === (input.value || "true")) : (input.value = cur);
  else if (read()) set(key, read());
  let t: ReturnType<typeof setTimeout>;
  const h = () => (clearTimeout(t), ms ? (t = setTimeout(write, ms)) : write());
  el.addEventListener("input", h);
  el.addEventListener("change", h);
  subscribe(() => {
    const v = get(key);
    if (checked) input.checked = v === (input.value || "true");
    else if (input.value !== (v ?? "")) input.value = v ?? "";
  });
}

/** The `data-state-*` family: actions (set / toggle / clear / step, with `data-state-on` choosing the trigger) and views (show / class / text / bind). */
export function mount(el: Element) {
  const win = el.ownerDocument.defaultView!;
  if (el.hasAttribute("data-state-bind")) bind(el);
  if (["show", "text", "class", "src"].some((n) => el.hasAttribute("data-state-" + n))) {
    // A gate on a form field (`field:<name>`) re-tests as the visitor types.
    if (/\bfield:/.test(el.getAttribute("data-state-show") ?? "") || /\bfield:/.test(el.getAttribute("data-state-class") ?? "")) watchFields();
    paint(el);
    subscribe(() => paint(el));
  }
  if (!["set", "toggle", "clear", "step"].some((n) => el.hasAttribute("data-state-" + n))) return;
  const on = el.getAttribute("data-state-on") || (el.hasAttribute("data-every") && !el.hasAttribute("data-state-set") ? "interval" : "click");
  if (on === "load") runStateAction(el);
  else if (on === "interval") {
    const t = setInterval(() => (el.isConnected ? win.matchMedia?.("(prefers-reduced-motion: reduce)").matches || runStateAction(el) : clearInterval(t)), Math.max(parseDuration(el.getAttribute("data-every"), 5000), 250));
  } else el.addEventListener(on === "hover" ? "mouseenter" : "click", () => runStateAction(el));
}
