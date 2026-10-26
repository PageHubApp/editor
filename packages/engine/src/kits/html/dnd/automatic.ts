/**
 * The "Automatic" element: a container that becomes what its drop parent needs. First match:
 * parent is a page → a section with a content row inside; parent is a section → content; the
 * grandparent is a section or page → a card; the parent is a card or segment → a segment;
 * otherwise a plain stacked container.
 */
import type { EditorState } from "../../../state/state";
import type { NodeHandle } from "../../../state/handles";
import { isCard, isSegment, layoutClasses, roleOf } from "./layout";

export type MorphKind = "section" | "content" | "card" | "segment" | "plain";

export function morphKind(state: EditorState, parent: NodeHandle | null): MorphKind {
  const role = roleOf(parent);
  if (role === "page") return "section";
  if (role === "section") return "content";
  const grand = roleOf(parent?.parent());
  if (grand === "section" || grand === "page") return "card";
  if (isCard(state, parent) || isSegment(state, parent)) return "segment";
  return "plain";
}

/** Markup for an Automatic element dropped into `parent` (column 0). */
export function automaticSnippet(state: EditorState, parent: NodeHandle | null): string {
  const c = layoutClasses(state);
  const kind = morphKind(state, parent);
  if (kind === "section") return `<section class="${c.section}">\n  <div class="${c.content}"></div>\n</section>`;
  return `<div class="${c[kind]}"></div>`;
}
