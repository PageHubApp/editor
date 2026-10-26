/**
 * Peer class inherit: a new element whose definition sets `peerInherit` and lands in a parent
 * the definition lists copies the look of a same-definition sibling (the left neighbour by
 * default, else the other side): `btn*` tokens (today's active modifiers, which are plain
 * classes here) and the raw tokens templates use without a modifier name (rounded*, border*,
 * tracking-*, font weights, text-xs…2xl, px/py/min-*, self-*, w-full, gap-*). The snippet's own
 * tokens of those kinds are replaced. Pure text: the caller inserts the result in one edit.
 */
import { elementsFacet } from "../../extensions/facets";
import type { EditorState } from "../../state/state";
import type { InsertPoint } from "../../state/builder";
import type { NodeHandle } from "../../state/handles";
import type { TreeNode } from "../../parse/tree";
import { applySplices } from "../../edit/ops";
import { childrenOf } from "./nodes";

/** A token the inherit carries over (variant prefixes such as `md:` are ignored for the test, `md:w-` aside). */
export function isPeerToken(token: string): boolean {
  if (/^(?:sm|md|lg):w-/.test(token)) return true;
  const t = token.slice(token.lastIndexOf(":") + 1);
  return (
    t.startsWith("btn") || t.startsWith("rounded") || t.startsWith("!rounded") || t === "border" || t.startsWith("border-") ||
    t === "uppercase" || t === "lowercase" || t === "capitalize" || t.startsWith("tracking-") ||
    /^font-(bold|semibold|medium|normal|black)$/.test(t) || /^text-(xs|sm|base|lg|xl|2xl)$/.test(t) ||
    /^(?:px|py|min-h|min-w|self|gap)-/.test(t) || t === "w-full"
  );
}

const tokens = (s: string | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const defOf = (h: NodeHandle) => h.element;
const defForTag = (state: EditorState, tag: string) => state.facet(elementsFacet).find((e) => typeof e.match === "string" && e.match.split(/\s*,\s*/).includes(tag));

/** `snippet` with the peer's classes applied, or `snippet` itself when nothing applies. */
export function withPeerClasses(state: EditorState, snippet: string, nodes: TreeNode[], at: InsertPoint): string {
  const top = nodes[0];
  if (nodes.length !== 1 || top?.kind !== "element") return snippet;
  const def = defForTag(state, top.tag);
  const cfg = def?.peerInherit;
  if (!def || !cfg) return snippet;
  const anchor = "before" in at ? at.before : "after" in at ? at.after : "prepend" in at ? at.prepend : at.append;
  const parent = "before" in at || "after" in at ? anchor.parent() : anchor;
  const parentDef = parent && parent.kind === "element" ? defOf(parent) : undefined;
  if (!parent || !parentDef || !cfg.whenParentIs.includes(parentDef.name)) return snippet;
  const list = childrenOf(parent).filter((c) => c.kind === "element" && defOf(c)?.name === def.name);
  const all = childrenOf(parent);
  const pos = "append" in at ? all.length : "prepend" in at ? 0 : all.indexOf(anchor) + ("after" in at ? 1 : 0);
  const left = list.filter((c) => all.indexOf(c) < pos).reverse();
  const right = list.filter((c) => all.indexOf(c) >= pos);
  const ref = (cfg.reference === "right-neighbor" ? [...right, ...left] : [...left, ...right])[0];
  const inherited = tokens(ref?.attr("class")).filter(isPeerToken);
  if (!inherited.length) return snippet;
  const cls = top.attributes.find((a) => a.name === "class" && !a.liquid);
  const own = cls ? /class\s*=\s*["']([^"']*)["']/.exec(snippet.slice(cls.range.start, cls.range.end))?.[1] : "";
  if (own === undefined || inherited.some((t) => t.includes('"'))) return snippet;
  const next = [...tokens(own).filter((t) => !isPeerToken(t)), ...inherited].join(" ");
  const insert = `class="${next}"`;
  if (cls) return applySplices(snippet, [{ from: cls.range.start, to: cls.range.end, insert }]);
  const end = top.openTag.start + 1 + top.tag.length;
  return applySplices(snippet, [{ from: end, to: end, insert: ` ${insert}` }]);
}
