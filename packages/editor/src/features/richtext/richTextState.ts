/**
 * Rich-text session state: which text leaf is being edited and which toolbar panel is open.
 * Effect-only (never an undo step). Enter / Space on a selected text leaf start editing; the
 * canvas layer (`RichTextLayer`) does the rest.
 */
import { StateEffect, StateField, contributes, defineCommand, effectsOf, t, type EditorState, type Extension, type NodeHandle } from "@pagehub/engine";
import { inlineText, isRichTextLeaf } from "@pagehub/engine/kits";
import type { RichTextPanel } from "./session";

interface RichTextState {
  editing: NodeHandle | null;
  panel: RichTextPanel | null;
}

const EMPTY: RichTextState = { editing: null, panel: null };
export const setRichText = StateEffect.define<Partial<RichTextState>>("richText.set");

const richTextField = StateField.define<RichTextState>({
  name: "richText",
  create: () => EMPTY,
  update(value, tr) {
    const patches = effectsOf(tr, setRichText);
    let next = patches.length ? patches.reduce<RichTextState>((v, p) => ({ ...v, ...p }), value) : value;
    if (next.editing && !next.editing.alive) next = EMPTY;
    return next;
  },
});

export const richTextOf = (s: EditorState): RichTextState => (s.hasField(richTextField) ? s.field(richTextField) : EMPTY);

const richTextEdit = defineCommand<{ target?: NodeHandle } | undefined>({
  id: "richtext.edit",
  title: "Edit text",
  args: t.object({ target: t.handle<NodeHandle>().optional() }).optional(),
  run({ state, selection, tr, dispatch, ui }, args) {
    const h = args?.target ?? selection.primary;
    if (!state.hasField(richTextField) || ui.readOnly || !isRichTextLeaf(h) || richTextOf(state).editing === h) return false;
    dispatch?.(tr.effect(setRichText, { editing: h, panel: null }));
    return true;
  },
});

const richTextExit = defineCommand({
  id: "richtext.exit",
  title: "Stop editing text",
  run({ state, tr, dispatch }) {
    if (!richTextOf(state).editing) return false;
    dispatch?.(tr.effect(setRichText, EMPTY));
    return true;
  },
});

/** Open a panel; the open one again (or no panel) closes it. */
const richTextPanel = defineCommand<{ panel?: RichTextPanel }>({
  id: "richtext.panel",
  title: "Text panel",
  args: t.object({ panel: t.enum(["font", "link", "more", "textcolor", "bgcolor", "variable"] as const).optional() }),
  run({ state, tr, dispatch }, args) {
    const rt = richTextOf(state);
    if (!rt.editing) return false;
    const panel = !args?.panel || rt.panel === args.panel ? null : args.panel;
    if (panel === rt.panel) return false;
    dispatch?.(tr.effect(setRichText, { panel }));
    return true;
  },
});

const KEYS = contributes({
  keybindings: [
    { command: "richtext.edit", key: "enter", when: "selection && !textEditing" },
    { command: "richtext.edit", key: "space", when: "selection && !textEditing" },
    // After richtext.edit (which only runs on text): Enter on any other element selects its first child.
    { command: "element.selectChild", key: "enter", when: "selection && !textEditing && focus != 'panel'" },
  ],
});

const KIT: Extension = [inlineText(), richTextField, richTextEdit, richTextExit, richTextPanel, KEYS];

/** Rich text: the engine's `text.setInner` / `text.setTag`, the session field and its commands and keys. */
export function richTextKit(): Extension {
  return KIT;
}
