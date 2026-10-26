/** Read the editor session state (`uiField`). */
import { uiField, type UiState } from "../state/uiState";
import { useEditorState } from "./bindings";

export function useUi<T>(select: (ui: UiState) => T, equals?: (a: T, b: T) => boolean): T {
  return useEditorState((s) => select(s.field(uiField)), equals);
}

/** Equality for a selector that returns the scope fields a class write depends on (`view`, `dark`, `multiScope`). */
export const uiScopeEq = (a: Pick<UiState, "view" | "dark" | "multiScope">, b: Pick<UiState, "view" | "dark" | "multiScope">): boolean =>
  a.view === b.view && a.dark === b.dark && a.multiScope === b.multiScope;
