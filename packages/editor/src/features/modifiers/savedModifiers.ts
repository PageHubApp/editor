/**
 * The modifiers a user saved from an element's own classes ("Save current styles as modifier").
 * A saved modifier is a named bundle of real class tokens, stacked on an element the same way the
 * built-in `ph-mod-*` presets are. An HTML page has no per-component-type props slot to store these
 * in, so they are kept per-browser (one flat library that applies to any element — there is no
 * component-type scope to fabricate). Reactive through `useSavedModifiers`; every write persists
 * and notifies.
 */
import { useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "../../primitives/storage";

export interface SavedModifier {
  /** Stable id (slug of the label); applying toggles the bundle. */
  name: string;
  label: string;
  /** Space-joined class tokens this modifier stacks on an element. */
  classes: string;
}

const KEY = "saved-modifiers";
let state: readonly SavedModifier[] = readJSON<SavedModifier[]>(KEY, []);
const listeners = new Set<() => void>();

const emit = () => {
  writeJSON(KEY, state);
  for (const l of listeners) l();
};

/** A label → a stable slug id (lowercase, spaces to hyphens). */
const slugifyModifier = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, "-");

const getSavedModifiers = (): readonly SavedModifier[] => state;

/** Add (or replace by name) a saved modifier. No-op on an empty name or empty class list. */
export function addSavedModifier(label: string, classes: string): SavedModifier | null {
  const name = slugifyModifier(label);
  const cls = classes.trim();
  if (!name || !cls) return null;
  const mod: SavedModifier = { name, label: label.trim(), classes: cls };
  state = [...state.filter((m) => m.name !== name), mod];
  emit();
  return mod;
}

export function removeSavedModifier(name: string): void {
  const next = state.filter((m) => m.name !== name);
  if (next.length === state.length) return;
  state = next;
  emit();
}

/** The saved-modifier library, re-rendering on every change. */
export function useSavedModifiers(): readonly SavedModifier[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    getSavedModifiers,
    getSavedModifiers,
  );
}
