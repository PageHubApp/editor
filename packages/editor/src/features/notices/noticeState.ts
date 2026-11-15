/**
 * The editor's one notice ("Added Hero · Undo · Show"): a short message under the canvas with up
 * to two actions. One at a time — a new notice replaces the last. It lives in a core state field
 * (never in history), so showing one is a command (`notice.show`) any feature, the palette, MCP
 * and tests reach; `showNotice(store, …)` is the shorthand. `<NoticeHost>` renders it and hides
 * it after `NOTICE_MS` (paused while hovered).
 *
 * A later edit clears it, so an Undo button always undoes the step it announced. Two after hooks
 * announce the edits a site owner can lose track of: an `element.insert` ("Added <name>", Undo,
 * Show) and an `element.remove` of a section ("Section deleted", Undo).
 */
import { StateEffect, StateField, TransactionBuilder, afterTransaction, defineCommand, effectsOf, type EditorState, type NodeHandle, type Store, type Transaction } from "@pagehub/engine";
import { roleOf } from "@pagehub/engine/kits";
import { nodeName } from "../../state/nodeName";
import { revealNode } from "./revealNode";

export const NOTICE_MS = 5000;

export interface NoticeAction {
  label: string;
  run(store: Store): void;
}

export interface NoticeInput {
  message: string;
  /** `error` for a failed action (same look, an alert icon). */
  tone?: "info" | "error";
  /** At most two; extra ones are dropped. */
  actions?: readonly NoticeAction[];
}

export interface Notice extends Required<NoticeInput> {
  /** Changes with every show, so the same message shown twice restarts its timer. */
  id: number;
}

const setNotice = StateEffect.define<Notice | null>("notice.set");

let nextId = 1;
const make = (n: NoticeInput): Notice => ({ id: nextId++, message: n.message, tone: n.tone ?? "info", actions: (n.actions ?? []).slice(0, 2) });

export const noticeField = StateField.define<Notice | null>({
  name: "notice",
  create: () => null,
  update(value, tr) {
    const set = effectsOf(tr, setNotice);
    if (set.length) return set.at(-1)!;
    // only a person's next edit clears it: the save's own stamping (system) and the stored copy coming back
    // reformatted (remote) keep the notice, and its Undo still undoes the step it announced
    const userEdit = !tr.changes.empty && !tr.annotations.system && tr.annotations.origin !== "remote";
    return value && userEdit ? null : value;
  },
});

export const noticeOf = (s: EditorState): Notice | null => (s.hasField(noticeField) ? s.field(noticeField) : null);

const noticeShow = defineCommand<NoticeInput>({
  id: "notice.show",
  title: "Show notice",
  run(ctx, args) {
    if (!ctx.state.hasField(noticeField) || !args?.message) return false;
    ctx.dispatch?.(ctx.tr.effect(setNotice, make(args)));
    return true;
  },
});

const noticeDismiss = defineCommand({
  id: "notice.dismiss",
  title: "Dismiss notice",
  run(ctx) {
    if (!noticeOf(ctx.state)) return false;
    ctx.dispatch?.(ctx.tr.effect(setNotice, null));
    return true;
  },
});

/** Show a notice (replacing the current one). */
export function showNotice(store: Store, notice: NoticeInput): boolean {
  return store.run("notice.show", notice);
}

export const UNDO_ACTION: NoticeAction = { label: "Undo", run: (store) => void store.undo() };
export const showAction = (h: NodeHandle): NoticeAction => ({ label: "Show", run: (store) => void (h.alive && revealNode(store, h)) });

/** A command's own step (not an undo / redo replay, not a step appended by another hook). */
const ranCommand = (tr: Transaction, id: string) => tr.annotations.command === id && !tr.annotations.undo && !tr.changes.empty && !effectsOf(tr, setNotice).length;

const announce = (state: EditorState, notice: NoticeInput) => new TransactionBuilder(state).effect(setNotice, make(notice));

const announceInsert = afterTransaction("notice.insert", (state, tr) => {
  if (!ranCommand(tr, "element.insert")) return null;
  const h = state.selection.primary;
  if (!h?.alive) return null;
  return announce(state, { message: `Added ${nodeName(h)}`, actions: [UNDO_ACTION, showAction(h)] });
});

const announceSectionDelete = afterTransaction("notice.sectionDelete", (state, tr) => {
  if (!ranCommand(tr, "element.remove")) return null;
  const removed = tr.startState.selection.primary;
  if (!removed || removed.alive || roleOf(removed) !== "section") return null;
  return announce(state, { message: "Section deleted", actions: [UNDO_ACTION] });
});

export function noticesKit() {
  return [noticeField, noticeShow, noticeDismiss, announceInsert, announceSectionDelete];
}
