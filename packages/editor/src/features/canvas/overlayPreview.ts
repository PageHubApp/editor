/**
 * "Open on canvas": find what a selected element shows or hides, and read / toggle whether the canvas previews
 * it. Two kinds, one resolver (`previewTargetFor`), both canvas-only (nothing here writes to the document):
 * - `overlay`: the `[popover]` / `<dialog>` the element is, or points at (`popovertarget`, `commandfor`, or
 *   `data-show-on` + `data-show-target`) in ANY direction (open, toggle, hide, close): `canvasOf(s).openOverlays`.
 *   A `data-show-on` trigger whose target is a plain element resolves the same way: previewing it takes the `hidden`
 *   class off the target, as the runtime's `show` chunk does (`applyOverlayPreview`).
 * - `state`: the element's `data-state-set|toggle|clear|step` actions and `data-cart="open"`, run through the
 *   canvas runtime's own state store so every `data-state-show` / `-class` / `-text` that reads the key repaints:
 *   `canvasOf(s).statePreview` remembers each key's previous value so closing restores it.
 */
import type { NodeHandle, Path, Store } from "@pagehub/engine";
import { editSrcOf, type SourceHost } from "@pagehub/engine/canvas";
import type { EditorState } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { canvasOf, pageFiles } from "./canvasState";
import { elementsFor, srcOf } from "./frameDom";
import { useRenderStatus } from "./renderStatus";

export const OPEN_ON_CANVAS = "Open on canvas";
export const CLOSE_ON_CANVAS = "Close on canvas";

const OVERLAY = "[popover], dialog";
const STATE_ACTION_ATTRS = ["data-state-set", "data-state-toggle", "data-state-clear", "data-state-step"] as const;
/** Elements that read a state key: anything the runtime repaints when the key changes. */
const STATE_READERS = "[data-state-show], [data-state-class], [data-state-text], [data-state-src]";
/** Storage-backed keys: writing them would reach the editor's real localStorage, so they are never previewed. */
const STORED_KEY = /^(local|ls):/;

/** The runtime's state store, exposed on the canvas window once the site runtime has booted there. */
interface RuntimeState {
  get(key: string): string | undefined;
  set(key: string, value: string | undefined): void;
  run(el: Element, put: (key: string, value: string | undefined) => void): void;
}
const runtimeState = (doc: Document | null | undefined): RuntimeState | null => (doc?.defaultView as (Window & { __siteRuntime?: { state?: RuntimeState } }) | null | undefined)?.__siteRuntime?.state ?? null;

/** The main canvas document, kept per editor so panels outside the canvas (the layers tree) can resolve targets. */
const docs = new WeakMap<object, Document>();
export const setMainCanvasDoc = (store: Store, doc: Document): void => void docs.set(store, doc);
export const mainCanvasDoc = (store: Store): Document | null => docs.get(store) ?? null;

/** The main canvas document, re-read after every paint (for panels outside the canvas, like the Action card). */
export function useMainCanvasDoc(): Document | null {
  const store = useEditorStore();
  useRenderStatus(store);
  return mainCanvasDoc(store);
}

/** Cheap source-side check before touching the DOM: could this element be, point at, or run something previewable? */
export function isPreviewCandidate(h: NodeHandle): boolean {
  if (h.kind !== "element") return false;
  return h.tag === "dialog" || ["popover", "popovertarget", "commandfor", "data-show-on", "data-cart", ...STATE_ACTION_ATTRS].some((a) => h.attr(a) !== undefined);
}

/** The id a trigger points at, whatever its direction: `popovertarget`, `commandfor`, or `data-show-on`'s `data-show-target`. */
function triggerId(attr: (name: string) => string | null | undefined): string | null {
  return attr("popovertarget") || attr("commandfor") || (attr("data-show-on") != null ? attr("data-show-target") : null) || null;
}

/** The element a trigger points at in the canvas document. */
function triggerTarget(doc: Document, el: Element): Element | null {
  const id = triggerId((n) => el.getAttribute(n));
  return id ? doc.getElementById(id) : null;
}

/**
 * Edit src of what the element with edit src `src` shows: the popover / dialog it is or opens, else (for a
 * `data-show-on` trigger) the plain element it toggles through the `hidden` class: `data-show-target`'s element, or
 * itself without one. Null: it shows nothing.
 */
export function overlayTargetSrc(doc: Document | null, src: string | null | undefined): string | null {
  const el = src && doc ? elementsFor(doc, src)[0] : undefined;
  if (!el) return null;
  const target = el.matches(OVERLAY) ? el : triggerTarget(doc!, el);
  if (target?.matches(OVERLAY)) return srcOf(target);
  if (!el.hasAttribute("data-show-on")) return null;
  const plain = el.getAttribute("data-show-target") ? target : el;
  return plain ? srcOf(plain) : null;
}

const MARKUP = /\.(liquid|html?)$/;

/** The `[popover]` / `<dialog>` (or, with `anyElement`, any element) with `id` in any markup file (pages and partials alike), or null. */
function overlayInFiles(host: SourceHost, id: string, anyElement = false): NodeHandle | null {
  for (const path of host.state.files.keys()) {
    if (!MARKUP.test(path) || !host.state.files.get(path)?.includes(id)) continue;
    let tree;
    try {
      tree = host.state.tree(path);
    } catch {
      continue;
    }
    for (const n of tree.flat) {
      if (n.kind !== "element") continue;
      const h = host.registry.of(path, n);
      if (h.attr("id") === id && (anyElement || h.tag === "dialog" || h.attr("popover") !== undefined)) return h;
    }
  }
  return null;
}

/** What "Open on canvas" shows: an overlay (a popover / dialog) or a trigger's state actions. */
export type PreviewTarget =
  | {
      kind: "overlay";
      /** The overlay's edit src. */
      src: string;
      /** Set when the overlay is not in the canvas document (another page or a partial): opening goes there first. */
      path: Path | null;
    }
  | {
      kind: "state";
      /** The trigger's own edit src: the key into `statePreview`. */
      src: string;
      path: null;
    };

/** The state keys the actions on `el` write (a dry run through the runtime's own action code). */
function writtenKeys(rt: RuntimeState, el: Element): string[] {
  const keys: string[] = [];
  rt.run(el, (k) => void keys.push(k));
  return keys;
}

/** The trigger's state actions, when the canvas can run them and something on the page reads what they write. */
function stateTarget(doc: Document | null, h: NodeHandle): PreviewTarget | null {
  const rt = runtimeState(doc);
  const src = editSrcOf(h);
  const el = rt && doc ? elementsFor(doc, src)[0] : undefined;
  if (!rt || !doc || !el) return null;
  const keys = writtenKeys(rt, el);
  if (!keys.length || keys.some((k) => STORED_KEY.test(k))) return null;
  const readers = [...doc.querySelectorAll(STATE_READERS)];
  const read = (k: string) => readers.some((r) => ["show", "class", "text", "src"].some((n) => r.getAttribute("data-state-" + n)?.includes(k)));
  return keys.some(read) ? { kind: "state", src, path: null } : null;
}

/**
 * What the element `h` shows or hides: the overlay it is or points at, else the state its actions write. An
 * overlay is resolved in the canvas document first; a trigger whose target id is absent from it (the hamburger
 * in the header partial, its drawer in another partial) is resolved across the site's files instead.
 */
export function previewTargetFor(host: SourceHost, doc: Document | null, h: NodeHandle): PreviewTarget | null {
  if (!isPreviewCandidate(h)) return null;
  const local = overlayTargetSrc(doc, editSrcOf(h));
  if (local) return { kind: "overlay", src: local, path: null };
  const id = doc && triggerId((n) => h.attr(n));
  if (id && !doc.getElementById(id)) {
    const target = overlayInFiles(host, id, h.attr("data-show-on") !== undefined);
    if (target) return { kind: "overlay", src: editSrcOf(target), path: target.path };
  }
  return stateTarget(doc, h);
}

/** Whether the canvas shows `t` previewed (open, or its state actions applied). */
export function isPreviewOpen(s: EditorState, t: PreviewTarget): boolean {
  const c = canvasOf(s);
  return t.kind === "overlay" ? c.openOverlays.includes(t.src) : t.src in c.statePreview;
}

/** Apply a trigger's state actions through the runtime, remembering each key's previous value; or put them back. */
function toggleStatePreview(store: Store, t: PreviewTarget): void {
  const rt = runtimeState(mainCanvasDoc(store));
  const preview = canvasOf(store.state).statePreview;
  if (t.src in preview) {
    if (rt) for (const [k, prev] of [...preview[t.src]!].reverse()) rt.set(k, prev);
    const { [t.src]: _closed, ...rest } = preview;
    store.run("canvas.set", { statePreview: rest });
    return;
  }
  const el = rt && elementsFor(mainCanvasDoc(store)!, t.src)[0];
  if (!rt || !el) return;
  const prev: [string, string | undefined][] = [];
  rt.run(el, (k, v) => {
    prev.push([k, rt.get(k)]);
    rt.set(k, v);
  });
  store.run("canvas.set", { statePreview: { ...preview, [t.src]: prev } });
}

/**
 * Toggle the preview. An overlay in another file is first brought onto the canvas with the editor's own
 * navigation (a page: `canvas.set`; a partial: `component.edit`, else the inspector's "Edit partial" view), then
 * opened. Closing never navigates. Nothing is written to the files.
 */
export function togglePreviewTarget(store: Store, t: PreviewTarget): void {
  if (t.kind === "state") return toggleStatePreview(store, t);
  const open = canvasOf(store.state).openOverlays.includes(t.src);
  if (t.path && !open) {
    const ok = pageFiles(store.state).includes(t.path) ? store.run("canvas.set", { page: t.path }) : store.run("component.edit", { path: t.path }) || store.run("inspector.set", { componentEditor: t.path });
    if (!ok) return;
  }
  // arriving through `component.edit` may already have opened a root popover / dialog: don't toggle it shut
  if (!(t.path && !open && canvasOf(store.state).openOverlays.includes(t.src))) store.run("canvas.toggleOverlay", { src: t.src });
}

/**
 * For the selected element: the edit src of what it shows or hides, whether the canvas previews it now, and
 * the toggle. `src` is null when the element previews nothing. Re-resolves when the canvas re-renders (the
 * caller reads `doc` from the canvas context, which changes with every render).
 */
export function useOverlayPreview(doc: Document | null, handle: NodeHandle | null) {
  const store = useEditorStore();
  const target = handle?.alive ? previewTargetFor(store, doc, handle) : null;
  const open = useEditorState((s) => !!target && isPreviewOpen(s, target));
  return { src: target?.src ?? null, open, toggle: () => target && togglePreviewTarget(store, target) };
}
