/**
 * Canvas source mapping. The canvas renders a throwaway copy of every file in
 * which each element's opening tag carries `data-edit-src="<file>#<offset>"` (the element's start
 * offset). The copy is passed to the renderer as per-render overrides, so it never reaches the
 * document of record; a click on the rendered page reads the attribute back and becomes a handle.
 *
 *   const html = await renderCanvas(renderer, store.state, "index.liquid", data);
 *   const h = handleForSrc(store, el.getAttribute(EDIT_SRC_ATTR)); // the element in source
 *
 * Elements rendered more than once (`{% for %}` rows) share one value, so every row maps to the
 * one template element. Elements of a partial carry the partial's path (`partials/header.liquid`),
 * which is how the canvas knows a click landed inside an include.
 */
import { EDIT_ATTRIBUTES } from "../attributes/editAttributes";
import { applySplices } from "../edit/ops";
import type { EditorState, Path } from "../state/state";
import type { HandleRegistry, NodeHandle } from "../state/handles";

/** What the lookups need: a store, or a command context's state + registry. */
export interface SourceHost {
  readonly state: EditorState;
  readonly registry: HandleRegistry;
}

export const EDIT_SRC_ATTR = EDIT_ATTRIBUTES.src;

const STATIC_TAG = /^[a-zA-Z][\w-]*$/;
const MARKUP = /\.(liquid|html?)$/;

/** `index.liquid#42` for an element handle. */
export function editSrcOf(h: Pick<NodeHandle, "path" | "range">): string {
  return `${h.path}#${h.range.from}`;
}

export function parseEditSrc(value: string | null | undefined): { path: Path; offset: number } | null {
  const m = value ? /^(.+)#(\d+)$/.exec(value) : null;
  return m ? { path: m[1]!, offset: Number(m[2]) } : null;
}

/** One file's text with `data-edit-src` on every element whose tag name is static. */
export function instrumentFile(state: EditorState, path: Path): string {
  const tree = state.tree(path);
  const splices = tree.flat.flatMap((n) => {
    if (n.kind !== "element" || !STATIC_TAG.test(n.tag)) return [];
    const at = n.openTag.start + 1 + n.tag.length;
    return [{ from: at, to: at, insert: ` ${EDIT_SRC_ATTR}="${path}#${n.range.start}"` }];
  });
  return applySplices(tree.text, splices);
}

/** Instrumented copies of every markup file that parses (render overrides; never stored). */
export function instrumentFiles(state: EditorState): Record<Path, string> {
  const out: Record<Path, string> = {};
  for (const path of state.files.keys()) {
    if (!MARKUP.test(path)) continue;
    try {
      out[path] = instrumentFile(state, path);
    } catch {
      // a file that doesn't parse renders as stored (the renderer reports its error)
    }
  }
  return out;
}

/** Render `path` for the canvas: the same renderer and data as the page, over instrumented copies. */
export function renderCanvas(
  renderer: { render(path: Path, data: Record<string, unknown>, opts?: { overrides?: Record<Path, string>; mode?: "editor" | "publish" }): Promise<string> },
  state: EditorState,
  path: Path,
  data: Record<string, unknown> = {},
): Promise<string> {
  return renderer.render(path, data, { overrides: instrumentFiles(state), mode: "editor" });
}

/** Remove every `data-edit-src` from rendered HTML (what the plain render looks like). */
export function stripEditSrc(html: string): string {
  return html.replace(/ data-edit-src="[^"]*"/g, "");
}

/** The element a `data-edit-src` value names, in the current state; null when it is gone. */
export function handleForSrc(store: SourceHost, value: string | null | undefined): NodeHandle | null {
  const at = parseEditSrc(value);
  if (!at || !store.state.files.has(at.path)) return null;
  let tree;
  try {
    tree = store.state.tree(at.path);
  } catch {
    return null;
  }
  const n = tree.flat.find((x) => x.kind === "element" && x.range.start === at.offset);
  return n ? store.registry.of(at.path, n) : null;
}

const INCLUDE = /^\{%-?\s*(render|section)\s+(['"])([\w-]+)\2/;

/** `partials/header.liquid` → the include name and tag kind it is reached through. */
export function includeTarget(path: Path): { tag: "render" | "section"; name: string } | null {
  const m = /^(partials|sections)\/([\w-]+)\.liquid$/.exec(path);
  return m ? { tag: m[1] === "partials" ? "render" : "section", name: m[2]! } : null;
}

/** The `{% render %}` / `{% section %}` tag in `page` that includes `path`, or null. */
export function includeTagFor(store: SourceHost, page: Path, path: Path): NodeHandle | null {
  const target = includeTarget(path);
  if (!target || !store.state.files.has(page)) return null;
  const tree = store.state.tree(page);
  for (const n of tree.flat) {
    if (n.kind === "element") continue;
    const m = INCLUDE.exec(tree.text.slice(n.range.start, n.range.end));
    if (m && m[1] === target.tag && m[3] === target.name) return store.registry.of(page, n);
  }
  return null;
}
