/**
 * DOM helpers for the canvas document: find rendered elements by `data-edit-src`, stamp the
 * selection / hover / parent states as `data-*` attributes, and convert rects from the canvas
 * document into the host page (the frame's offset times the zoom).
 */
import type { Rect } from "./geometry";
import { CANVAS_CSS, CANVAS_STYLE_ID } from "./canvasCss";

export const SRC_ATTR = "data-edit-src";
const STATE_ATTRS = ["data-selected", "data-hover", "data-parent-of-selected"] as const;
/** Never ringed: the document itself. */
const UNMARKED = new Set(["HTML", "HEAD", "BODY"]);

export const srcOf = (el: Element | null): string | null => el?.closest(`[${SRC_ATTR}]`)?.getAttribute(SRC_ATTR) ?? null;

export function elementsFor(doc: Document, src: string | null | undefined): HTMLElement[] {
  if (!src) return [];
  return [...doc.querySelectorAll<HTMLElement>(`[${SRC_ATTR}="${CSS.escape(src)}"]`)].filter((el) => !UNMARKED.has(el.tagName));
}

/** Elements rendered from a file (an include's output). */
export function elementsOfFile(doc: Document, path: string): HTMLElement[] {
  const top: HTMLElement[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>(`[${SRC_ATTR}^="${CSS.escape(path)}#"]`)) {
    if (!el.parentElement?.closest(`[${SRC_ATTR}^="${CSS.escape(path)}#"]`)) top.push(el);
  }
  return top;
}

interface FrameStates {
  selected: string | null;
  parent: string | null;
  hover: string | null;
  gridlines: boolean;
  showHidden: boolean;
  /** Device frame: the page scrolls without a visible scrollbar (the frame draws its own). */
  device?: boolean;
  /** `client`: content mode outlines the `[data-editable]` elements on hover. */
  role?: string;
  /** Edit mode (not preview / read-only): enables the slim page scrollbar. */
  live?: boolean;
  /** `<details>` previewed closed (by edit src); every other one is shown open so its contents stay editable. */
  closedDetails?: readonly string[];
  /** `[popover]` / `<dialog>` previewed open (by edit src); every other one stays as the page has it. */
  openOverlays?: readonly string[];
}

/**
 * Canvas-only open / closed of every `<details>`: open unless its edit src is in `closed`. Never touches
 * the saved source.
 */
export function applyDetailsPreview(doc: Document, closed: readonly string[] | undefined): void {
  for (const d of doc.querySelectorAll("details")) {
    if (closed?.includes(srcOf(d) ?? "")) d.removeAttribute("open");
    else d.setAttribute("open", "");
  }
}

/** Marks an overlay this editor opened for the preview (so only those are ever closed again). */
const OVERLAY_MARK = "data-ph-overlay-open";
const POPOVER_KEPT = "data-ph-popover";
/** Marks a plain `data-show-on` target the preview un-hid (its `hidden` class goes back when the preview closes). */
const SHOW_MARK = "data-ph-show-open";

/**
 * Canvas-only open / closed of every `[popover]` and `<dialog>`: one is open exactly while its edit src is in
 * `open`. Never touches the saved source; an element the page itself opens (a `<dialog open>`) is left alone.
 * Popovers are held `manual` while previewed (an outside click can't light-dismiss them under the author), and get
 * their own `popover` value back when closed. Dialogs open non-modally (`show()`), so the canvas stays usable.
 */
export function applyOverlayPreview(doc: Document, open: readonly string[] | undefined): void {
  // A plain `data-show-on` target: the runtime's `show` chunk toggles its `hidden` class, so the preview takes it off.
  for (const el of doc.querySelectorAll<HTMLElement>(`[${SHOW_MARK}]`)) {
    if (open?.includes(srcOf(el) ?? "")) continue;
    el.removeAttribute(SHOW_MARK);
    el.classList.add("hidden");
  }
  for (const src of open ?? []) {
    for (const el of elementsFor(doc, src)) {
      if (el.matches("[popover], dialog") || !el.classList.contains("hidden")) continue;
      el.classList.remove("hidden");
      el.setAttribute(SHOW_MARK, "");
    }
  }
  for (const el of doc.querySelectorAll<HTMLElement>("[popover], dialog")) {
    const want = !!open?.includes(srcOf(el) ?? "");
    const marked = el.hasAttribute(OVERLAY_MARK);
    if (want === marked) continue;
    const dialog = el as HTMLDialogElement;
    try {
      if (el.tagName === "DIALOG") {
        if (want && !dialog.open) dialog.show();
        else if (!want) dialog.close();
      } else if (want) {
        el.setAttribute(POPOVER_KEPT, el.getAttribute("popover") ?? "");
        el.setAttribute("popover", "manual");
        el.showPopover();
      } else {
        el.hidePopover();
        el.setAttribute("popover", el.getAttribute(POPOVER_KEPT) ?? "");
        el.removeAttribute(POPOVER_KEPT);
      }
    } catch {
      // a browser without the popover / dialog APIs just shows nothing
    }
    el.toggleAttribute(OVERLAY_MARK, want);
  }
}

/**
 * Stamp the states: `data-selected` on every rendering of the selection (a static element is
 * made `relative` so node tools can anchor, and restored on deselect), `data-parent-of-selected`,
 * and `data-hover` only when hovered and not selected.
 */
export function applyFrameStates(doc: Document, s: FrameStates): void {
  for (const a of STATE_ATTRS) for (const el of doc.querySelectorAll(`[${a}]`)) el.removeAttribute(a);
  for (const el of doc.querySelectorAll<HTMLElement>("[data-position-override]")) {
    el.style.position = el.getAttribute("data-position-override") ?? "";
    el.removeAttribute("data-position-override");
  }
  applyDetailsPreview(doc, s.closedDetails);
  applyOverlayPreview(doc, s.openOverlays);
  const win = doc.defaultView;
  for (const el of elementsFor(doc, s.selected)) {
    el.setAttribute("data-selected", "true");
    const pos = win?.getComputedStyle(el).position;
    if (!pos || pos === "static") {
      el.setAttribute("data-position-override", el.style.position);
      el.style.position = "relative";
    }
  }
  for (const el of elementsFor(doc, s.parent)) el.setAttribute("data-parent-of-selected", "true");
  if (s.hover && s.hover !== s.selected) for (const el of elementsFor(doc, s.hover)) el.setAttribute("data-hover", "true");
  const root = doc.documentElement;
  root.setAttribute("data-show-gridlines", String(s.gridlines));
  root.setAttribute("data-show-hidden", String(s.showHidden));
  root.setAttribute("data-device", String(!!s.device));
  root.setAttribute("data-ph-live", String(!!s.live));
  if (s.role) root.setAttribute("data-ph-role", s.role);
  else root.removeAttribute("data-ph-role");
}

/** Marks a `<style>` in the editor's document that is meant for the canvas (CanvasStyleBridge). */
export const CANVAS_BRIDGE_ATTR = "data-ph-canvas-style";

/**
 * Mirror the editor's own stylesheets into the canvas so the page's utility classes (Tailwind /
 * DaisyUI) paint — the iframe is a separate document and otherwise sees none of the design system.
 * `doc.open()` wipes the head on every write, so this re-runs each time; the chrome stylesheet is
 * skipped (it is re-added after, so its selection rings win), cross-origin / headless parents are
 * tolerated. A page that carries its own compiled stylesheet (`#site-css`, from the host's `siteCss`)
 * gets only the canvas bridge styles: the host app's stylesheets are its own UI, and their utilities
 * (`.collapse`, `.container`, …) would restyle the site's classes of the same name.
 */
function syncHostStyles(doc: Document): void {
  try {
    const host = doc.defaultView?.parent?.document;
    if (!host || host === doc) return;
    const head = doc.head ?? doc.documentElement;
    const selector = doc.getElementById("site-css") ? `style[${CANVAS_BRIDGE_ATTR}]` : 'link[rel="stylesheet"], style';
    for (const node of host.querySelectorAll(selector)) {
      if (node.id === CANVAS_STYLE_ID) continue;
      if (node instanceof HTMLLinkElement) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = node.href; // resolved absolute, so it loads regardless of the iframe's base URL
        head.appendChild(link);
      } else {
        const style = doc.createElement("style");
        style.textContent = node.textContent;
        head.appendChild(style);
      }
    }
  } catch {
    // a cross-origin or headless parent can't be read; the page still renders, just unstyled
  }
}

/** The host's runtime URL made absolute against the editor's page (the frame is `about:blank`). */
function runtimeSrc(doc: Document, runtimeUrl: string | null | undefined): string | null {
  if (!runtimeUrl) return null;
  try {
    return new URL(runtimeUrl, doc.defaultView?.parent?.location.href).href;
  } catch {
    return runtimeUrl;
  }
}

/**
 * Boot the site runtime in the canvas document, in edit mode (`data-ph-edit`: render chunks run, author
 * click/submit behaviour does not). `doc.open()` replaces the root element, so `start()` (a no-op only
 * while `data-runtime` is on the current root) re-runs cleanly on every write and never double-mounts;
 * the module is fetched once (from the host's `runtimeUrl`) and re-entered through `__siteRuntime.start`,
 * the handle every runtime build registers. With no `runtimeUrl` the frame just isn't booted.
 */
function bootRuntime(doc: Document, src: string | null): void {
  const win = doc.defaultView as (Window & { __siteRuntime?: { start(): void } }) | null;
  if (!win) return;
  doc.documentElement.setAttribute("data-ph-edit", "");
  if (win.__siteRuntime) return void win.__siteRuntime.start();
  if (!src || doc.querySelector(`script[data-ph-runtime]`)) return;
  const s = doc.createElement("script");
  s.type = "module";
  s.src = src;
  s.setAttribute("data-ph-runtime", "");
  (doc.head ?? doc.documentElement).appendChild(s);
}

/** The pinned Leaflet build the runtime's map chunk loads (`LEAFLET.js` in site-runtime `chunks/map.ts`). */
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** A URL as a CSP source expression: an exact file (no query or fragment), `;` and `,` escaped. */
const cspSource = (url: string): string => {
  const u = url.split(/[?#]/)[0]!;
  return u.replace(/;/g, "%3B").replace(/,/g, "%2C").replace(/\s/g, "");
};

/**
 * The policy every canvas document is written under: the site's own code never executes on the editor's origin
 * (docs/action-items/specs/site-js-allowed.md). No `'unsafe-inline'` (inline `<script>`, `on*` attributes and
 * `javascript:` URLs are refused), no `'unsafe-eval'`, no `'strict-dynamic'`: the only scripts are two exact files, the
 * PageHub runtime the host names and the Leaflet build its map chunk loads. `srcdoc` / `about:blank` children inherit it.
 * `form-action 'none'`: no site form submits from the canvas (Preview leaves its buttons clickable), because the frame is
 * the editor's origin and a POST from it would carry the editor's session past the server's cross-origin write check.
 */
export function canvasCsp(runtime: string | null): string {
  const scripts = runtime ? `${cspSource(runtime)} ${LEAFLET_JS}` : "'none'";
  return `script-src ${scripts}; object-src 'none'; base-uri 'none'; form-action 'none'`;
}

const DOCTYPE = /^\s*<!doctype[^>]*>/i;
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * `html` with the canvas policy `<meta>` in front of every byte of the site's markup, so the parser holds it before the
 * site's `<head>` (or anything before it) is read. A leading doctype stays first, keeping the document's mode; the
 * site's own `<html>` attributes still land on the root, its `<head>` content in the head.
 */
export function withCanvasPolicy(html: string, runtime: string | null): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escAttr(canvasCsp(runtime))}">`;
  const doctype = DOCTYPE.exec(html)?.[0] ?? "";
  return doctype + meta + html.slice(doctype.length);
}

/**
 * Write rendered HTML into the canvas document, with the editor's stylesheets and the chrome stylesheet. The document is
 * written under `canvasCsp`: it stays same-origin (the editor reads and writes it directly) but no script of the site's
 * runs in it.
 */
export function writeFrame(doc: Document, html: string, runtimeUrl?: string | null, closedDetails?: readonly string[], openOverlays?: readonly string[]): void {
  const runtime = runtimeSrc(doc, runtimeUrl);
  doc.open();
  doc.write(withCanvasPolicy(html, runtime));
  doc.close();
  // Editor-only: a native <details> renders collapsed, hiding its contents from the author, so each
  // opens here, except the ones previewed closed (canvas state, never the saved source). Re-runs
  // on every render since the write wipes it.
  applyDetailsPreview(doc, closedDetails);
  applyOverlayPreview(doc, openOverlays);
  syncHostStyles(doc);
  const head = doc.head ?? doc.documentElement;
  let style = doc.getElementById(CANVAS_STYLE_ID);
  if (!style) {
    style = doc.createElement("style");
    style.id = CANVAS_STYLE_ID;
    head.appendChild(style);
  }
  style.textContent = CANVAS_CSS;
  // The opened site's OWN inline styles (compiled Tailwind in #site-css, palette/fonts in #site-theme —
  // both written into the HTML by the canvas renderer, so the page paints styled with no async flash)
  // must win over the mirrored editor stylesheet: move them to the end of the head, build then theme.
  const siteCss = doc.getElementById("site-css");
  if (siteCss) head.appendChild(siteCss);
  const siteTheme = doc.getElementById("site-theme");
  if (siteTheme) head.appendChild(siteTheme);
  bootRuntime(doc, runtime);
}

export const toRect = (r: { left: number; top: number; width: number; height: number }): Rect => ({
  left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height,
});

/** A canvas-document rect in the coordinates of `host` (the overlay layer). */
export function hostRect(r: Rect, frame: Element, host: Element, zoom: number): Rect {
  const f = frame.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  return toRect({ left: f.left - h.left + r.left * zoom, top: f.top - h.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom });
}

/** Whether a rect in `host` coordinates overlaps the frame's visible box (false: its element is scrolled out of the frame). */
export function visibleInFrame(r: Rect, frame: Element, host: Element): boolean {
  const f = frame.getBoundingClientRect();
  if (f.width <= 0 || f.height <= 0) return true;
  const h = host.getBoundingClientRect();
  const left = f.left - h.left;
  const top = f.top - h.top;
  return r.right >= left && r.left <= left + f.width && r.bottom >= top && r.top <= top + f.height;
}

/** Union of several rects (an include's output, a repeated row's template). */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return toRect({ left, top, width: right - left, height: bottom - top });
}

/** A canvas point in canvas-document coordinates from a host-page client point. */
export function framePoint(frame: Element, zoom: number, clientX: number, clientY: number): { x: number; y: number } {
  const f = frame.getBoundingClientRect();
  return { x: (clientX - f.left) / zoom, y: (clientY - f.top) / zoom };
}
