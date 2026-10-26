/**
 * One rich-text editing session: TipTap mounted ON the leaf's rendered element in the canvas
 * document (the element itself becomes the contentEditable, so it keeps its own styles).
 *
 * Typing is buffered: the session commits ONE `text.setInner` when typing pauses for
 * `GROUP_DELAY`, on blur, before an undo and when it ends — so a burst of typing is one
 * transaction and one undo step (the engine also groups commits on the same leaf). TipTap's own
 * history is not loaded: ⌘Z / ⇧⌘Z inside the text commit the pending group and run the editor's
 * undo / redo, so there is one history.
 *
 * The canvas re-renders after each commit; `remount(el)` moves the session onto the fresh
 * element, keeping the caret (and any typing not yet committed).
 */
import { Editor as TipTap, Extension } from "@tiptap/core";
import { closeHistoryGroup, type ElementTreeNode, type NodeHandle, type Store } from "@pagehub/engine";
import { GROUP_DELAY } from "@pagehub/engine";
import { isRichTextLeaf } from "@pagehub/engine/kits";
import { NODE, richTextSchema } from "./schema";
import { holdAutosave, registerPendingCommit } from "../save/saveHolds";
import { findTrigger } from "./suggest";
import { filterVariables, sessionVariables, type VariableItem } from "./variableItems";
import { leafToDoc, type JsonNode } from "./toDoc";
import { docToSource } from "./toSource";

export type RichTextPanel = "font" | "link" | "more" | "textcolor" | "bgcolor" | "variable";

interface SessionHooks {
  /** ⌘K, or a click on a link: open a toolbar panel. */
  openPanel(panel: RichTextPanel): void;
  /** Esc inside the text. */
  escape(): void;
  /** Any TipTap transaction (selection, marks): the toolbar re-reads its state. */
  changed(): void;
}

/** The `{{` suggestion list: the text typed after `{{` (replaced on pick), what matches it, the highlighted row. */
export interface Suggestion {
  from: number;
  to: number;
  query: string;
  items: VariableItem[];
  index: number;
}

const SUGGEST_MAX = 50;

/** What TipTap sets on the element it mounts on. */
const EDITOR_ATTRS = ["class", "role", "translate", "tabindex", "contenteditable"] as const;

const stopPress =(e: Event) => e.stopPropagation();

export class RichTextSession {
  editor!: TipTap;
  private committed = "";
  /** The element as the canvas rendered it, and the source it showed, when this mount began. */
  private pristine: { html: string; attrs: Record<string, string | null> } | null = null;
  private pristineSource = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private suggestIndex = 0;
  private suggestKey = "";
  private dismissedAt: number | null = null;

  constructor(
    readonly store: Store,
    readonly handle: NodeHandle,
    el: HTMLElement,
    private readonly hooks: SessionHooks,
  ) {
    this.mount(el, this.sourceDoc(), "end");
    this.unregisterCommit = registerPendingCommit(() => void this.flush());
  }

  private unregisterCommit: () => void = () => {};
  /** Autosave waits while an IME composition is open. */
  private releaseComposition: (() => void) | null = null;
  private readonly onCompositionStart = () => {
    this.releaseComposition ??= holdAutosave();
  };
  private readonly onCompositionEnd = () => {
    this.releaseComposition?.();
    this.releaseComposition = null;
  };

  /** The leaf's current source as a TipTap document. */
  private sourceDoc(): JsonNode {
    return leafToDoc(this.store.state.files.get(this.handle.path)!, this.handle.node() as ElementTreeNode);
  }

  /** The inner source the text currently stands for. */
  serialize(): string {
    return docToSource(this.editor.getJSON() as JsonNode);
  }

  private keys() {
    const session = this;
    return Extension.create({
      name: "pagehubRichTextKeys",
      priority: 1000,
      addKeyboardShortcuts() {
        return {
          "Mod-k": () => {
            if (this.editor.isActive("link")) this.editor.commands.extendMarkRange("link");
            session.hooks.openPanel("link");
            return true;
          },
          ArrowDown: () => session.moveSuggestion(1),
          ArrowUp: () => session.moveSuggestion(-1),
          Tab: () => session.acceptSuggestion(),
          Enter: () => session.acceptSuggestion(),
          "Mod-z": () => session.history("undo"),
          "Shift-Mod-z": () => session.history("redo"),
          "Mod-y": () => session.history("redo"),
          Escape: () => session.dismissSuggestion() || (session.hooks.escape(), true),
        };
      },
    });
  }

  private mount(el: HTMLElement, content: JsonNode, focus: "end" | { from: number; to: number }) {
    el.setAttribute("data-rt-editing", "");
    this.pristine = { html: el.innerHTML, attrs: Object.fromEntries(EDITOR_ATTRS.map((a) => [a, el.getAttribute(a)])) };
    this.editor = new TipTap({
      element: { mount: el },
      extensions: [...richTextSchema(), this.keys()],
      content,
      injectCSS: false,
      autofocus: false,
      editorProps: {
        handleClick: (view, pos) => {
          const $pos = view.state.doc.resolve(pos);
          if (!$pos.marks().some((m) => m.type.name === "link")) return false;
          this.editor.chain().setTextSelection(pos).extendMarkRange("link").run();
          this.hooks.openPanel("link");
          return true;
        },
      },
      onUpdate: () => this.typed(),
      onTransaction: () => this.hooks.changed(),
      onBlur: () => this.flush(true),
    });
    // ProseMirror's own press handler has run by now (it listens on this element first); the canvas must not see the press
    el.addEventListener("mousedown", stopPress);
    el.addEventListener("compositionstart", this.onCompositionStart);
    el.addEventListener("compositionend", this.onCompositionEnd);
    this.committed = this.pristineSource = this.serialize();
    el.toggleAttribute("data-rt-blank", this.editor.isEmpty);
    const size = this.editor.state.doc.content.size;
    const sel = focus === "end" ? { from: size, to: size } : { from: Math.min(focus.from, size), to: Math.min(focus.to, size) };
    this.editor.commands.setTextSelection(sel);
    el.focus?.();
  }

  /** The open `{{` suggestion list, or null when the caret isn't right after `{{…` (or Esc dismissed it). */
  suggestion(): Suggestion | null {
    const sel = this.editor.state.selection;
    if (!sel.empty) return null;
    const before = sel.$from.parent.textBetween(Math.max(0, sel.$from.parentOffset - 80), sel.$from.parentOffset, undefined, "\ufffc");
    const hit = findTrigger(before);
    if (!hit) {
      this.dismissedAt = null;
      return null;
    }
    const from = sel.from - hit.length;
    if (this.dismissedAt === from) return null;
    const items = filterVariables(sessionVariables(this), hit.query).flatMap((g) => g.items).slice(0, SUGGEST_MAX);
    const key = `${from}:${hit.query}`;
    if (key !== this.suggestKey) [this.suggestKey, this.suggestIndex] = [key, 0];
    return items.length ? { from, to: sel.from, query: hit.query, items, index: Math.min(this.suggestIndex, items.length - 1) } : null;
  }

  moveSuggestion(by: 1 | -1): boolean {
    const s = this.suggestion();
    if (!s) return false;
    this.suggestIndex = (s.index + by + s.items.length) % s.items.length;
    this.hooks.changed();
    return true;
  }

  /** Replace the typed `{{…` with the highlighted (or the `index`th) variable as an output chip. */
  acceptSuggestion(index?: number): boolean {
    const s = this.suggestion();
    const item = s?.items[index ?? s.index];
    if (!s || !item) return false;
    this.editor.chain().focus().deleteRange({ from: s.from, to: s.to }).insertContent({ type: NODE.output, attrs: { source: `{{ ${item.expression} }}` } }).run();
    return true;
  }

  dismissSuggestion(): boolean {
    const s = this.suggestion();
    if (!s) return false;
    this.dismissedAt = s.from;
    this.hooks.changed();
    return true;
  }

  private typed() {
    (this.editor.view.dom as HTMLElement).toggleAttribute("data-rt-blank", this.editor.isEmpty);
    this.dirty = this.serialize() !== this.committed;
    clearTimeout(this.timer);
    if (this.dirty) this.timer = setTimeout(() => this.flush(), GROUP_DELAY);
  }

  /** Commit pending typing as one `text.setInner`; `close` also ends the history group (blur). */
  flush(close = false): boolean {
    clearTimeout(this.timer);
    let ran = false;
    if (this.dirty && isRichTextLeaf(this.handle)) {
      const source = this.serialize();
      ran = this.store.run("text.setInner", { target: this.handle, source });
      this.committed = source;
      this.dirty = false;
    }
    if (close) this.store.dispatch((tr) => tr.effect(closeHistoryGroup, null));
    return ran;
  }

  private history(kind: "undo" | "redo"): boolean {
    this.flush(true);
    this.store.run(`history.${kind}`);
    return true;
  }

  /** Move onto the element a fresh render made; typing not yet committed is kept. */
  remount(el: HTMLElement): void {
    if (this.editor.view.dom === el) return;
    const { from, to } = this.editor.state.selection;
    const content = this.dirty ? (this.editor.getJSON() as JsonNode) : this.sourceDoc();
    const dirty = this.dirty;
    this.teardown();
    this.mount(el, content, { from, to });
    if (dirty) this.typed();
  }

  private teardown() {
    clearTimeout(this.timer);
    const dom = this.editor.view.dom as HTMLElement;
    dom.removeEventListener("mousedown", stopPress);
    dom.removeEventListener("compositionstart", this.onCompositionStart);
    dom.removeEventListener("compositionend", this.onCompositionEnd);
    this.onCompositionEnd();
    this.editor.destroy();
    dom.removeAttribute("data-rt-editing");
    dom.removeAttribute("data-rt-blank");
  }

  /** Commit and stop editing. */
  end(): void {
    this.flush(true);
    this.unregisterCommit();
    const dom = this.editor.view.dom as HTMLElement;
    const unchanged = this.serialize() === this.pristineSource;
    this.teardown();
    // TipTap empties and stamps the element; the canvas only re-renders when the text changed, so put it back
    const { html, attrs } = this.pristine!;
    for (const [name, value] of Object.entries(attrs)) value === null ? dom.removeAttribute(name) : dom.setAttribute(name, value);
    if (unchanged) dom.innerHTML = html;
  }
}
