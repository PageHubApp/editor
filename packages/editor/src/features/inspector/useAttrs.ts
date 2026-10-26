/**
 * Read / write an element's attributes from a structured editor: `read(name)` is the value (null
 * when absent, re-read whenever the file changes) and `write(name, value)` sets it ("" or null
 * removes it) as one undo step.
 *
 *   const { read, write } = useAttrs(handle);
 *   write("data-state-in-view", "deck:step=intro");
 */
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState } from "../../react/bindings";
import { useCommit } from "../liquid/useCommit";

export function useAttrs(handle: NodeHandle) {
  const commit = useCommit();
  useEditorState((s) => s.files.get(handle.path));
  const read = (name: string): string | null => (handle.alive && handle.kind === "element" ? (handle.attr(name) ?? null) : null);
  const write = (name: string, value: string | null) => commit("attr.set", { name, value: value === "" ? null : value, at: handle });
  return { read, write };
}
