/**
 * Which collection entry a repeated element shows, for the canvas copy (`instrumentFile`).
 *
 * An element whose own content or attributes print `{{ X.f … }}`, where `X` is a local variable in
 * scope at the element, gets `data-edit-row="{{ X.id }}" data-edit-field="f …"`. Local means one of:
 *  - the variable of an enclosing `{% for X in … %}` / `{% tablerow X in … %}`;
 *  - a name an earlier `{% assign X = … %}` in the same file sets (a detail page's `… | first`);
 *  - in `partials/<name>.liquid`, a name some `{% render '<name>', X: … %}` passes (also `with … as X`,
 *    `for … as X`, and bare `with` / `for`, which bind the partial's own name).
 * Everything else is a global (`collections`, `company`, `section`, `forloop`, …) and gets nothing. "Own"
 * content stops at child elements and at nested `{% for %}` / `{% tablerow %}` blocks (their loop variable
 * is not in scope at the element). With several local variables, the first one printed wins. `X.id`
 * rendering empty means "no entry"; consumers ignore an empty `data-edit-row`.
 */
import { EDIT_ATTRIBUTES } from "../attributes/editAttributes";
import type { EditorState, Path, SourceTree } from "../state/state";
import type { ElementTreeNode, TreeNode } from "../parse/tree";

const NAME = "[A-Za-z_][\\w-]*";
const LOOP_TAGS = new Set(["for", "tablerow"]);
const LOOP_VAR = new RegExp(`^\\{%-?\\s*(?:for|tablerow)\\s+(${NAME})\\s+in\\b`);
const ASSIGN = new RegExp(`\\{%-?\\s*assign\\s+(${NAME})\\s*=`, "g");
/** `{{ X.f`: the head variable and the first property read. */
const OUTPUT_READ = new RegExp(`\\{\\{-?\\s*(${NAME})\\.(${NAME})`, "g");
const RENDER = /\{%-?\s*render\s+(['"])([\w-]+)\1([\s\S]*?)-?%\}/g;
const RENDER_ARG = new RegExp(`,\\s*(${NAME})\\s*:`, "g");
const RENDER_BIND = new RegExp(`^\\s*(?:with|for)\\s+[^\\s,]+(?:\\s+as\\s+(${NAME}))?`);
const PARTIAL = /^partials\/([\w-]+)\.liquid$/;
const MARKUP = /\.(liquid|html?)$/;

/** Partial name → the variable names its `{% render %}` callers pass, across every markup file. */
export function partialParams(state: EditorState): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [path, text] of state.files) {
    if (!MARKUP.test(path) || typeof text !== "string" || !text.includes("render")) continue;
    for (const m of text.matchAll(RENDER)) {
      const name = m[2]!;
      const rest = m[3]!;
      const set = out.get(name) ?? out.set(name, new Set()).get(name)!;
      for (const a of rest.matchAll(RENDER_ARG)) set.add(a[1]!);
      const bind = RENDER_BIND.exec(rest);
      if (bind) set.add(bind[1] ?? name);
    }
  }
  return out;
}

/** `(head, field)` reads printed by the element's own outputs: attributes first, then content. */
function ownReads(tree: SourceTree, el: ElementTreeNode): Array<[string, string]> {
  const reads: Array<[string, string]> = [];
  const scan = (text: string) => {
    for (const m of text.matchAll(OUTPUT_READ)) reads.push([m[1]!, m[2]!]);
  };
  scan(tree.text.slice(el.openTag.start, el.openTag.end));
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.kind === "content") {
        if (n.type === "LiquidVariableOutput") scan(tree.text.slice(n.range.start, n.range.end));
      } else if (n.kind === "liquid-block" && !LOOP_TAGS.has(n.tag)) n.branches.forEach((b) => walk(b.children));
    }
  };
  walk(el.children);
  return reads;
}

/** Local variable names in scope at `el`: enclosing loop variables, earlier assigns, the partial's params. */
function localsAt(tree: SourceTree, el: ElementTreeNode, params: ReadonlySet<string>): Set<string> {
  const locals = new Set(params);
  for (let p = tree.parent(el); p; p = tree.parent(p)) {
    if (p.kind !== "liquid-block" || !LOOP_TAGS.has(p.tag)) continue;
    const m = LOOP_VAR.exec(tree.text.slice(p.openTag.start, p.openTag.end));
    if (m) locals.add(m[1]!);
  }
  for (const m of tree.text.slice(0, el.range.start).matchAll(ASSIGN)) locals.add(m[1]!);
  return locals;
}

/** The attributes to add to `el`'s opening tag in the canvas copy (with a leading space), or "". */
export function rowAttributes(tree: SourceTree, el: ElementTreeNode, params: ReadonlySet<string>): string {
  const reads = ownReads(tree, el);
  if (!reads.length) return "";
  const locals = localsAt(tree, el, params);
  const head = reads.find(([h]) => locals.has(h))?.[0];
  if (!head) return "";
  const fields = [...new Set(reads.filter(([h, f]) => h === head && f !== "id").map(([, f]) => f))];
  if (!fields.length) return "";
  return ` ${EDIT_ATTRIBUTES.row}="{{ ${head}.id }}" ${EDIT_ATTRIBUTES.field}="${fields.join(" ")}"`;
}

/** The params of the partial at `path` (empty for pages and sections). */
export function paramsFor(path: Path, all: Map<string, Set<string>>): ReadonlySet<string> {
  const m = PARTIAL.exec(path);
  return (m && all.get(m[1]!)) || new Set();
}
