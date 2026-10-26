// The canvas iframe: renders the page and maps pointer / keyboard input back to source via `data-edit-src`.
/**
 * The canvas iframe. Renders the page (instrumented copy) into its document after every text
 * change, and maps pointer input back to source through `data-edit-src`:
 * - mousedown selects the deepest rendered element (single selection; modifiers don't add);
 *   mousedown on no element clears the selection; a second click on the selected element that
 *   moved ≤ 10px deselects it;
 * - mouseover hovers immediately (never while a drag runs), leaving the document clears hover;
 * - right-click (not in an editable field) selects and opens the context menu at the pointer;
 * - links don't navigate. Nothing reacts in preview mode;
 * - keys pressed inside the frame (outside its text fields) are re-dispatched on the frame
 *   element, so the editor's scoped keymap hears them (preview's Esc too);
 * - while rich text is being edited in the frame, its own `text.setInner` commits don't rewrite
 *   the document (the DOM already shows the text, and a rewrite would reset the caret); the
 *   skipped render happens when the editing ends.
 * Session states are stamped as `data-*` attributes; `CANVAS_CSS` draws them.
 */
import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { editSrcOf } from "@pagehub/engine/canvas";
import { CanvasRenderContext, defaultCanvasRender } from "./canvasContext";
import { useCanvasHost } from "./canvasHost";
import { canvasOf, canvasPage, lastEditOf } from "./canvasState";
import { isTextSurface } from "../keyboard/domKeymap";
import { applyFrameStates, elementsFor, srcOf, writeFrame } from "./frameDom";
import { setRenderStatus, useRenderStatus } from "./renderStatus";
import { setMainCanvasDoc } from "./overlayPreview";
import { PageSkeleton } from "./PageSkeleton";
import { InlineError } from "../../primitives/InlineError";
import { useDelayedFlag } from "../../primitives/useDelayedFlag";

/** The longest the skeleton waits for the first paint to settle. */
const PAINT_CAP_MS = 1500;

/** A render that has not finished in this long is reported as a failure (with Retry), never an endless wait. */
const RENDER_TIMEOUT_MS = 20_000;

/** Resolves once the document's fonts are ready and two frames have painted after them (capped, never an endless wait). */
export function whenPainted(doc: Document, capMs = PAINT_CAP_MS): Promise<void> {
  const win = doc.defaultView;
  if (!win) return Promise.resolve();
  const frames = new Promise<void>((done) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => done())));
  const fonts = doc.fonts?.ready ?? Promise.resolve();
  const cap = new Promise<void>((done) => setTimeout(done, capMs));
  return Promise.race([Promise.all([fonts, frames]).then(() => undefined), cap]);
}

/** Movement (px) under which a click on the selected element counts as a second click. */
const DESELECT_SLOP = 10;

const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], .ProseMirror";
/** Elements whose native click would navigate, submit, toggle or activate — suppressed in edit mode. */
const INTERACTIVE = "a[href], button, input, select, textarea, label, summary, option, [role='button'], [role='link'], [role='menuitem'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch']";
const STATE_ACTION = "[data-state-set], [data-state-toggle], [data-state-clear], [data-state-step]";
/** Width of the disclosure marker zone at a summary's left edge. */
const MARKER_ZONE = 20;

/** The `<details>` a press previews open / closed: Alt-click on its summary, or a click on the summary's marker. */
function detailsToggleSrc(e: MouseEvent): string | null {
  if (e.button !== 0) return null;
  const summary = (e.target as Element).closest?.("summary");
  const details = summary?.parentElement;
  if (!summary || details?.tagName !== "DETAILS") return null;
  if (!e.altKey && e.clientX - summary.getBoundingClientRect().left > MARKER_ZONE) return null;
  return srcOf(details);
}

const srcOrNull = (h: { alive: boolean; kind: string; path: string; range: { from: number } } | null | undefined) => (h?.alive && h.kind === "element" ? editSrcOf(h as never) : null);

interface CanvasFrameProps {
  className?: string;
  style?: CSSProperties;
  /** Called after each render is written (frame, its document, render count). */
  onRendered?(frame: HTMLIFrameElement, doc: Document, version: number): void;
  /** Read-only mirror: renders, but never selects or hovers. */
  readOnly?: boolean;
  /** Wait this long after an edit before rendering (the mirror's 60ms). */
  delayMs?: number;
}

export function CanvasFrame({ className = "", style, onRendered, readOnly = false, delayMs = 0 }: CanvasFrameProps) {
  const store = useEditorStore();
  const hostRender = useContext(CanvasRenderContext);
  const canvasHost = useCanvasHost();
  const render = useMemo(() => hostRender ?? defaultCanvasRender(store, canvasHost), [hostRender, store, canvasHost]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const [stale, setStale] = useState(0);
  const skipped = useRef(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const files = useEditorState((s) => s.files);
  const page = useEditorState(canvasPage);
  const preview = useEditorState((s) => chromeOf(s).preview);
  const live = !readOnly && !preview;
  const status = useRenderStatus(store);
  const waiting = useDelayedFlag(!readOnly && status.pending);
  // The first-paint skeleton stays until the frame has really painted (fonts and styles applied), not just until it was written.
  const [revealed, setRevealed] = useState(false);

  // render after every text change; a stale render is dropped
  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (message: string) => {
      if (!readOnly) setRenderStatus(store, { pending: false, settled: true });
      setRenderError(message);
    };
    const run = () => {
      if (!readOnly) setRenderStatus(store, { pending: true });
      timer = setTimeout(() => !cancelled && !readOnly && fail(`Rendering ${page} is taking too long.`), RENDER_TIMEOUT_MS);
      return render(store.state, page).then(
      (html) => {
        clearTimeout(timer);
        const f = frame.current;
        const doc = f?.contentDocument;
        if (cancelled || !f || !doc) return;
        if (!readOnly && doc.querySelector("[data-rt-editing]") && lastEditOf(store.state)?.command === "text.setInner") return void (skipped.current = true);
        skipped.current = false;
        setRenderError(null);
        const scroll = doc.defaultView ? { x: doc.defaultView.scrollX, y: doc.defaultView.scrollY } : null;
        writeFrame(doc, html, canvasHost?.runtimeUrl, canvasOf(store.state).closedDetails, canvasOf(store.state).openOverlays);
        if (scroll && (scroll.x || scroll.y)) doc.defaultView?.scrollTo(scroll.x, scroll.y);
        if (!readOnly) {
          setMainCanvasDoc(store, doc);
          setRenderStatus(store, { pending: false, painted: page, version: versionRef.current + 1 });
        }
        const next = ++versionRef.current;
        setVersion(next);
        if (!readOnly) {
          whenPainted(doc).then(() => {
            if (cancelled) return;
            setRevealed(true);
            setRenderStatus(store, { settled: true });
          });
        }
        onRendered?.(f, doc, next);
      },
      (err: unknown) => {
        clearTimeout(timer);
        if (cancelled || readOnly) return;
        const e = err as { message?: string; file?: string; path?: string } | null;
        const where = e?.file ?? e?.path;
        fail((where ? `${where}: ` : "") + (e?.message ?? String(err)));
      },
    );
    };
    const t = delayMs ? setTimeout(run, delayMs) : (run(), undefined);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timer);
    };
  }, [files, page, render, store, delayMs, stale, readOnly]);

  // an unmounting main canvas leaves nothing "pending" behind
  useEffect(() => () => void (!readOnly && setRenderStatus(store, { pending: false })), [store, readOnly]);

  // a render skipped during rich-text editing runs once the editing ends
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !version || readOnly || typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => void (skipped.current && !doc.querySelector("[data-rt-editing]") && setStale((n) => n + 1)));
    mo.observe(doc, { subtree: true, attributes: true, attributeFilter: ["data-rt-editing"] });
    return () => mo.disconnect();
  }, [version, readOnly]);

  // keys inside the frame reach the editor's keymap (scoped to the editor's own root)
  useEffect(() => {
    const f = frame.current;
    const doc = f?.contentDocument;
    if (!f || !doc || !version || readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextSurface(e.target)) return;
      const Ctor = (f.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.KeyboardEvent ?? KeyboardEvent;
      const fwd = new Ctor("keydown", { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, bubbles: true, cancelable: true });
      f.dispatchEvent(fwd);
      if (fwd.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [version, readOnly]);

  // pointer input → commands (re-attached after each write: document.open drops listeners)
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !version || !live) return;
    let pending: { x: number; y: number } | null = null;
    const primarySrc = () => srcOrNull(store.state.selection.primary);
    const onDown = (e: MouseEvent) => {
      const toggle = detailsToggleSrc(e);
      if (toggle) return void store.run("canvas.toggleDetails", { src: toggle });
      // A press in the frame never reaches the host document: forward it so popovers and panels
      // dismiss on an outside press (their listeners are document-level, capture).
      const host = frame.current?.ownerDocument;
      const Ptr = host?.defaultView?.PointerEvent;
      if (host && Ptr) host.body.dispatchEvent(new Ptr("pointerdown", { bubbles: true, button: e.button }));
      if (e.button !== 0) return;
      const src = srcOf(e.target as Element);
      if (!src) return void store.run("selection.clear");
      pending = src === primarySrc() ? { x: e.clientX, y: e.clientY } : null;
      store.run("canvas.select", { src });
    };
    const onUp = (e: MouseEvent) => {
      if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) <= DESELECT_SLOP) store.run("selection.clear");
      pending = null;
    };
    const dragging = () => doc.body?.hasAttribute("data-is-dragging");
    const onOver = (e: MouseEvent) => void (!dragging() && store.run("canvas.hover", { src: srcOf(e.target as Element) }));
    const onOut = (e: MouseEvent) => void (!e.relatedTarget && store.run("canvas.hover", { src: null }));
    const onContext = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest?.(EDITABLE)) return;
      const src = srcOf(t);
      if (!src) return;
      e.preventDefault();
      store.run("canvas.select", { src });
      const f = frame.current!.getBoundingClientRect();
      const z = chromeOf(store.state).zoom || 1;
      store.run("contextMenu.open", { x: f.left + e.clientX * z, y: f.top + e.clientY * z });
    };
    // Edit mode never activates the page's own controls: a click on a link, button, submit input,
    // label etc. selects the node (on mousedown) and its default — navigate / submit / toggle — is
    // suppressed in the capture phase, before any inner handler runs. Forms never submit.
    // State actions (`data-state-set` chips and the like) only re-filter the canvas, so they still run:
    // the default is cancelled but the event reaches the runtime's own listener.
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest?.(INTERACTIVE)) {
        e.preventDefault();
        if (!t.closest?.(STATE_ACTION)) e.stopPropagation();
      }
    };
    const onSubmit = (e: Event) => e.preventDefault();
    doc.addEventListener("mousedown", onDown);
    doc.addEventListener("mouseup", onUp);
    doc.addEventListener("mouseover", onOver);
    doc.addEventListener("mouseout", onOut);
    doc.addEventListener("contextmenu", onContext);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("submit", onSubmit, true);
    return () => {
      doc.removeEventListener("mousedown", onDown);
      doc.removeEventListener("mouseup", onUp);
      doc.removeEventListener("mouseover", onOver);
      doc.removeEventListener("mouseout", onOut);
      doc.removeEventListener("contextmenu", onContext);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("submit", onSubmit, true);
    };
  }, [version, live, store]);

  // stamp selection / hover / parent / view toggles
  const selected = useEditorState((s) => srcOrNull(s.selection.primary));
  const parent = useEditorState((s) => srcOrNull(s.selection.primary?.alive ? s.selection.primary.parent() : null));
  const hover = useEditorState((s) => srcOrNull(s.selection.hover));
  const gridlines = useEditorState((s) => chromeOf(s).gridlines);
  const showHidden = useEditorState((s) => chromeOf(s).showHidden);
  const inDevice = useEditorState((s) => canvasOf(s).device);
  const closedDetails = useEditorState((s) => canvasOf(s).closedDetails);
  const openOverlays = useEditorState((s) => canvasOf(s).openOverlays);
  const role = (store as { role?: string }).role;
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !version) return;
    applyFrameStates(doc, live ? { selected, parent, hover, gridlines, showHidden, device: inDevice, role, live: true, closedDetails, openOverlays } : { selected: null, parent: null, hover: null, gridlines: false, showHidden: false, device: inDevice, closedDetails, openOverlays });
  }, [version, live, selected, parent, hover, gridlines, showHidden, inDevice, role, closedDetails, openOverlays]);

  // scroll-into-view on a breakpoint / device switch lives in useScrollOnSwitch (Viewport)

  const iframe = <iframe ref={frame} {...{ [readOnly ? "data-mirror-frame" : "data-canvas-frame"]: "" }} data-render-version={version} aria-label="Page canvas" className={`block h-full w-full border-0 ${className}`} style={style} />;
  // First paint: a page-shaped skeleton from mount until the frame has painted (no blank gap before it, none after).
  // Later renders / page switches keep the previous page and show a hairline bar.
  const firstPaint = !readOnly && !revealed && !renderError;
  const refreshing = waiting && revealed;
  return (
    <>
      {iframe}
      {firstPaint && <PageSkeleton />}
      {refreshing && <div role="progressbar" aria-label="Rendering page" data-render-pending="" className="bg-primary pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 animate-pulse" />}
      {renderError && (
        <div data-render-error className="absolute inset-x-2 top-2 z-50" style={{ zoom: "var(--device-zoom-inverse, 1)" }}>
          <InlineError variant="banner" message={`Render failed: ${renderError}`} onRetry={() => setStale((n) => n + 1)} />
        </div>
      )}
    </>
  );
}
