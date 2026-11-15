/**
 * `useAttrs` for attributes that may hold bindings (`src="{{ item.photo | image_url: width: 800 }}"`,
 * `alt="Photo of {{ item.title }}"`). `attr.set` refuses Liquid in a value, so a value with
 * `{{ … }}` is spliced into the element's own source (`source.replace`, one undo step); plain
 * values still go through `attr.set`. `writeAll` sets several attributes as one undo step.
 *
 *   const { read, write, writeAll } = useBoundAttrs(handle);
 *   write("src", "{{ item.photo | image_url: width: 800 }}");
 *   writeAll({ src: "{{ 'm1' | image_url }}", alt: "A red door" });
 */
import { setAttributeSplices, type ElementTreeNode, type NodeHandle } from "@pagehub/engine";
import { useEditorStore } from "../../../react/bindings";
import { useCommit } from "../../liquid/useCommit";
import { useAttrs } from "../useAttrs";

/** The element's source with each attribute set to its value (null removes it); null when it can't be written. */
export function withAttrSource(handle: NodeHandle, file: string, attrs: Readonly<Record<string, string | null>>): string | null {
  if (!handle.alive || handle.kind !== "element") return null;
  try {
    const el = (handle.node() as ElementTreeNode).node;
    const splices = Object.entries(attrs).flatMap(([name, value]) => setAttributeSplices(file, el, name, value));
    const base = handle.range.from;
    let text = handle.text();
    for (const s of [...splices].sort((a, b) => b.from - a.from)) text = text.slice(0, s.from - base) + s.insert + text.slice(s.to - base);
    return text;
  } catch {
    return null; // a `"` in the value: not writable inside double quotes
  }
}

export function useBoundAttrs(handle: NodeHandle) {
  const { read, write: writePlain } = useAttrs(handle);
  const store = useEditorStore();
  const commit = useCommit();
  const write = (name: string, value: string | null): boolean => {
    const v = value === "" ? null : value;
    if (v === null || !/[{}]/.test(v)) return writePlain(name, v);
    const text = withAttrSource(handle, store.state.files.get(handle.path) ?? "", { [name]: v });
    return text !== null && commit("source.replace", { at: handle, text });
  };
  const writeAll = (attrs: Readonly<Record<string, string | null>>): boolean => {
    const entries = Object.entries(attrs).map(([k, v]) => [k, v === "" ? null : v] as const);
    if (entries.length === 1) return write(entries[0]![0], entries[0]![1]);
    const text = withAttrSource(handle, store.state.files.get(handle.path) ?? "", Object.fromEntries(entries));
    return text !== null && text !== handle.text() && commit("source.replace", { at: handle, text });
  };
  return { read, write, writeAll };
}
