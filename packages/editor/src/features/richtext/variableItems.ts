/**
 * Variables for the rich-text toolbar: the engine's catalogue for this session's editor, and
 * inserting one as an `{{ output }}` chip.
 */
import type { Editor as TipTap } from "@tiptap/core";
import type { JsonValue } from "@pagehub/engine/render";
import { filterVariables, variableCatalogue, type VariableGroup, type VariableItem } from "@pagehub/engine";
import { NODE } from "./schema";
import type { RichTextSession } from "./session";

export type { VariableGroup, VariableItem };
export { filterVariables };

/** The groups for the session's editor (empty groups left out). */
export function sessionVariables(session: RichTextSession): VariableGroup[] {
  const store = session.store as { state: RichTextSession["store"]["state"]; data?: Record<string, JsonValue> };
  return variableCatalogue({ state: store.state, data: store.data ?? {} });
}

/** Insert `{{ expression }}` as an output chip at the caret (replacing the selection). */
export function insertVariable(ed: TipTap, expression: string): void {
  ed.chain().focus().insertContent({ type: NODE.output, attrs: { source: `{{ ${expression.trim()} }}` } }).run();
}
