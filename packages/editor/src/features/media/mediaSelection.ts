/**
 * Selection of the media grid as pure functions over the visible ids.
 *
 * - Pick mode (`selectionMode`): one item, always.
 * - Click selects one; Shift-click selects the range from the last click (added to the selection
 *   with ⌘/Ctrl); ⌘/Ctrl-click toggles; ⌘A selects all visible.
 * - Arrows move the single selection: ←/→ by 1, ↑/↓ by 5 in cards, 1 in a list.
 */
import type { ViewMode } from "./mediaHelpers";

export interface Selection {
  ids: readonly string[];
  /** The one the toolbar acts on (Enter, preview). */
  primary: string | null;
  /** Where a Shift-range starts. */
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: [], primary: null, anchor: null };
export const selectOne = (id: string | null): Selection => (id ? { ids: [id], primary: id, anchor: id } : EMPTY_SELECTION);

export interface Modifiers {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function select(sel: Selection, visible: readonly string[], id: string, mod: Modifiers = {}, pickMode = false): Selection {
  if (pickMode) return selectOne(id);
  const toggle = !!mod.metaKey || !!mod.ctrlKey;
  const from = sel.anchor ? visible.indexOf(sel.anchor) : -1;
  const to = visible.indexOf(id);
  if (mod.shiftKey && from > -1 && to > -1) {
    const range = visible.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { ids: toggle ? [...new Set([...sel.ids, ...range])] : range, primary: id, anchor: id };
  }
  if (toggle) return { ids: sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id], primary: id, anchor: id };
  return selectOne(id);
}

export function selectAll(visible: readonly string[], pickMode = false): Selection {
  return pickMode || visible.length === 0 ? EMPTY_SELECTION : { ids: visible, primary: visible[0]!, anchor: visible[visible.length - 1]! };
}

export function move(sel: Selection, visible: readonly string[], key: string, view: ViewMode): Selection | null {
  if (!visible.length) return null;
  const at = Math.max(0, visible.indexOf(sel.primary ?? visible[0]!));
  const step = view === "cards" ? 5 : 1;
  const next = { ArrowLeft: at - 1, ArrowRight: at + 1, ArrowUp: at - step, ArrowDown: at + step }[key];
  return next === undefined ? null : selectOne(visible[Math.max(0, Math.min(visible.length - 1, next))]!);
}
