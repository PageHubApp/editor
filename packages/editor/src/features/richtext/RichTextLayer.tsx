/**
 * The `InlineTextToolbar` slot: rich-text editing on the canvas, over the source-text core and
 * the iframe canvas.
 * - A click on the already-selected text leaf (or Enter / Space with it selected) starts editing:
 *   TipTap mounts on the rendered element, caret at the end. Clicks inside the text stay with
 *   TipTap (the canvas's second-click deselect never sees them).
 * - Editing ends when the selection moves off the leaf (or Esc with no panel open).
 * - The toolbar sits centred 8px below the element, flipped above when it would leave the
 *   canvas, kept 4px inside its edges.
 * - Panels close on Esc, on a mousedown outside the toolbar, and when a non-empty text
 *   selection collapses.
 * - Empty text leaves show a dashed "Empty text" hint ("Click to edit" once selected).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { editSrcOf, handleForSrc } from "@pagehub/engine/canvas";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { useOverlay } from "../../primitives/overlayStack";
import { useCanvasFrame } from "../canvas/canvasContext";
import { elementsFor, hostRect, srcOf, toRect } from "../canvas/frameDom";
import { chromeOf } from "../../shell/chromeState";
import { RichTextSession, type RichTextPanel } from "./session";
import { isRichTextLeaf } from "@pagehub/engine/kits";
import { InlineToolbar } from "./InlineToolbar";
import { TextContextMenu } from "./TextContextMenu";
import { VariableSuggest } from "./VariableSuggest";
import { richTextOf } from "./richTextState";
import { RICHTEXT_CSS, RICHTEXT_STYLE_ID } from "./richTextCss";

/** Gap between the element and the toolbar, and the inset from the canvas edges. */
const TOOLBAR_GAP = 8;
const EDGE_PAD = 4;

/** Mark empty text leaves for the "Empty text" hint, and (re)install the rich-text CSS. */
function stampEmpty(doc: Document, store: ReturnType<typeof useEditorStore>) {
  if (!doc.getElementById(RICHTEXT_STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = RICHTEXT_STYLE_ID;
    style.textContent = RICHTEXT_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  for (const el of doc.querySelectorAll<HTMLElement>("[data-edit-src]")) {
    const empty =
      !el.hasAttribute("data-rt-editing") &&
      !el.children.length &&
      !el.textContent?.trim() &&
      !isSpacerInText(el) &&
      !drawsPseudoContent(el) &&
      isRichTextLeaf(handleForSrc(store, el.getAttribute("data-edit-src")));
    el.toggleAttribute("data-rt-empty", empty);
  }
}

/**
 * An empty inline element inside a text block that has words (`<h1>Navigate <span></span> claims</h1>`, as site
 * builders write spacing): not an empty field to fill, so no hint, which would push the heading out of shape.
 */
function isSpacerInText(el: HTMLElement): boolean {
  if (!isInline(el)) return false;
  let block = el.parentElement;
  while (block && isInline(block)) block = block.parentElement;
  return !!block?.textContent?.trim();
}

/** An icon-font glyph (`<i class="fab fa-facebook-f"></i>`) or other CSS-drawn content: not an empty field. */
export function drawsPseudoContent(el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  return ["::before", "::after"].some(p => {
    const content = view.getComputedStyle(el, p).content;
    return !!content && content !== "none" && content !== "normal" && content !== '""';
  });
}

const INLINE_TAGS = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "em", "font", "i", "kbd", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u"]);

/** Laid out inline: the computed `display`, or the tag's default where the DOM doesn't compute one. */
function isInline(el: Element): boolean {
  const display = el.ownerDocument.defaultView?.getComputedStyle(el).display ?? "";
  return display ? display.startsWith("inline") : INLINE_TAGS.has(el.localName);
}

const hasOwnText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === 3 && !!n.textContent?.trim());

/**
 * The outermost text block holding `target` as inline markup: an ancestor text leaf with text of
 * its own (`<p>Hello <strong>you</strong></p>` → the `p`). Null when `target` is not inside one —
 * a link that is all of its list item's content stays its own element.
 */
function textBlockOf(target: Element, store: ReturnType<typeof useEditorStore>): Element | null {
  let block: Element | null = null;
  for (let el = target.closest("[data-edit-src]")?.parentElement?.closest("[data-edit-src]") ?? null; el; el = el.parentElement?.closest("[data-edit-src]") ?? null) {
    if (hasOwnText(el) && isRichTextLeaf(handleForSrc(store, el.getAttribute("data-edit-src")))) block = el;
  }
  return block;
}

export function RichTextLayer() {
  const store = useEditorStore();
  const { doc, frame, host, version } = useCanvasFrame();
  const { editing, panel } = useEditorState(richTextOf);
  const primary = useEditorState((s) => s.selection.primary);
  const zoom = useEditorState((s) => chromeOf(s).zoom) || 1;
  const session = useRef<RichTextSession | null>(null);
  const [active, setActive] = useState<RichTextSession | null>(null);
  const [, setTick] = useState(0);
  const toolbar = useRef<HTMLDivElement>(null);
  const wasEmpty = useRef(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openPanel = (p?: RichTextPanel) => void store.run("richtext.panel", p ? { panel: p } : {});

  // a click on the selected leaf starts editing; clicks inside the edited text stay with TipTap
  useEffect(() => {
    if (!doc) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      // a press inside the edited text is ProseMirror's (the session stops it before the canvas sees it)
      if (session.current?.editor.view.dom.contains(target)) return;
      if (richTextOf(store.state).panel) openPanel();
      // a press on bold / a link inside a paragraph belongs to the paragraph, not to that inline element
      const block = textBlockOf(target, store);
      const hit = block ?? target;
      const h = store.state.selection.primary;
      if (h && isRichTextLeaf(h) && srcOf(hit) === editSrcOf(h)) {
        e.stopPropagation();
        store.run("richtext.edit");
      } else if (block) {
        e.stopPropagation();
        store.run("canvas.select", { src: srcOf(block) });
      }
    };
    // right-click in the edited text: the text menu (anywhere else the canvas / browser handles it)
    const onContext = (e: MouseEvent) => {
      if (!frame || !session.current?.editor.view.dom.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      const f = frame.getBoundingClientRect();
      setMenu({ x: f.left + e.clientX * zoom, y: f.top + e.clientY * zoom });
    };
    stampEmpty(doc, store);
    doc.addEventListener("mousedown", onDown, true);
    doc.addEventListener("contextmenu", onContext, true);
    return () => {
      doc.removeEventListener("mousedown", onDown, true);
      doc.removeEventListener("contextmenu", onContext, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, version, store, frame, zoom]);

  // the session follows `editing` and moves onto each fresh render of the element
  useEffect(() => {
    const cur = session.current;
    if (cur && cur.handle !== editing) {
      session.current = null;
      setActive(null);
      cur.end();
      if (doc) stampEmpty(doc, store);
    }
    if (!editing || !doc) return;
    const el = elementsFor(doc, editSrcOf(editing))[0];
    if (!el) return;
    if (!session.current) {
      session.current = new RichTextSession(store, editing, el, {
        openPanel: (p) => void store.run("richtext.panel", { panel: p }),
        escape: () => void (richTextOf(store.state).panel ? openPanel() : store.run("richtext.exit")),
        changed: () => setTick((n) => n + 1),
      });
      el.removeAttribute("data-rt-empty");
      setActive(session.current);
    } else session.current.remount(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, doc, version, store]);

  useEffect(() => () => session.current?.end(), []);

  // selecting anything else ends editing
  useEffect(() => {
    if (editing && primary !== editing) store.run("richtext.exit");
  }, [editing, primary, store]);

  // a non-empty text selection collapsing closes the panel
  const selectionEmpty = active ? active.editor.state.selection.empty : true;
  useEffect(() => {
    if (selectionEmpty && !wasEmpty.current && richTextOf(store.state).panel) openPanel();
    wasEmpty.current = selectionEmpty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionEmpty]);

  // outside mousedown (host page) closes the panel; Esc via the overlay stack. A click in a
  // portaled popover the panel opened (the Font panel's `FontPicker` slot) is not "outside".
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : (e.target as Node).parentElement;
      if (toolbar.current?.contains(e.target as Node) || t?.closest("[data-ph-popover]")) return;
      openPanel();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);
  useOverlay({ id: "richtext-panel", isOpen: !!panel, onDismiss: () => openPanel() });

  // position: centred below the element, flipped above when it would leave the canvas
  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const el = active?.editor.view.dom as HTMLElement | undefined;
    const place = (next: CSSProperties | null) => setPos((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    if (!active || !el || !frame || !host) return place(null);
    const r = hostRect(toRect(el.getBoundingClientRect()), frame, host, zoom);
    const height = toolbar.current?.offsetHeight || 40;
    const width = toolbar.current?.offsetWidth || 0;
    const room = host.clientHeight || Infinity;
    const below = r.bottom + TOOLBAR_GAP + height <= room || r.top - TOOLBAR_GAP - height < 0;
    const centre = r.left + r.width / 2;
    const left = Math.max(EDGE_PAD + width / 2, Math.min(centre, (host.clientWidth || Infinity) - EDGE_PAD - width / 2));
    place({ left, top: below ? r.bottom + TOOLBAR_GAP : r.top - TOOLBAR_GAP, transform: below ? "translateX(-50%)" : "translate(-50%, -100%)" });
  });

  if (!active || !editing) return <span data-slot="InlineTextToolbar" hidden />;

  // the `{{` suggestion drops under the caret (its own overlay-positioned wrapper), not under the toolbar
  const suggestion = active.suggestion();
  let suggestStyle: CSSProperties | undefined;
  if (suggestion && frame && host) {
    try {
      const c = active.editor.view.coordsAtPos(suggestion.to);
      const r = hostRect(toRect({ left: c.left, top: c.bottom, width: 0, height: 0 }), frame, host, zoom);
      suggestStyle = { left: r.left, top: r.top + 4 };
    } catch {
      /* the caret pos can be momentarily out of range while the doc updates */
    }
  }

  return (
    <>
      <div ref={toolbar} data-slot="InlineTextToolbar" data-rt-toolbar="" data-pagehub-canvas-chrome="" className="pointer-events-auto absolute z-[110] w-fit max-w-full cursor-default font-sans" style={pos ?? { visibility: "hidden" }} onMouseDown={(e) => e.stopPropagation()}>
        <InlineToolbar session={active} panel={panel} openPanel={openPanel} />
        <TextContextMenu session={active} at={menu} onClose={() => setMenu(null)} />
      </div>
      {suggestStyle && (
        <div data-rt-suggest-wrap="" data-pagehub-canvas-chrome="" className="pointer-events-auto absolute z-[111] font-sans" style={suggestStyle} onMouseDown={(e) => e.stopPropagation()}>
          <VariableSuggest session={active} />
        </div>
      )}
    </>
  );
}
