/**
 * Variables for the rich-text toolbar: the engine's catalogue for this session's editor, led by
 * the fields of the collection the text repeats over (`{% for item in collections.products %}`:
 * "Price", a number, as `item.price`), and inserting one as an `{{ output }}` chip.
 */
import type { Editor as TipTap } from "@tiptap/core";
import type { JsonValue } from "@pagehub/engine/render";
import { filterVariables, variableCatalogue, type VariableGroup, type VariableItem } from "@pagehub/engine";
import { collectionRowsFacet } from "@pagehub/engine/host";
import { canvasOf } from "../canvas/canvasState";
import { peekCollections } from "../liquid/collectionsCache";
import { loopCollection, withFields, type LoopCollection } from "../liquid/collectionFields";
import { NODE } from "./schema";
import type { RichTextSession } from "./session";

export type { VariableGroup, VariableItem };
export { filterVariables };

type SessionLike = Pick<RichTextSession, "store" | "handle">;

/** The collection the session's text repeats over, when the host lists it. `onLoad` runs once the host's list arrives. */
export function sessionLoop(session: SessionLike, onLoad?: () => void): LoopCollection | null {
  const state = session.store.state;
  const list = peekCollections(state.facet(collectionRowsFacet), canvasOf(state).dataVersion, onLoad);
  return list ? loopCollection(session.handle, list, state.files.get(session.handle.path) ?? "") : null;
}

/** The groups for the session's editor (empty groups left out), the loop's collection fields first. */
export function sessionVariables(session: SessionLike, onLoad?: () => void): VariableGroup[] {
  const store = session.store as { state: RichTextSession["store"]["state"]; data?: Record<string, JsonValue> };
  return withFields(variableCatalogue({ state: store.state, data: store.data ?? {} }), sessionLoop(session, onLoad));
}

/** Insert `{{ expression }}` as an output chip at the caret (replacing the selection). */
export function insertVariable(ed: TipTap, expression: string): void {
  ed.chain().focus().insertContent({ type: NODE.output, attrs: { source: `{{ ${expression.trim()} }}` } }).run();
}
