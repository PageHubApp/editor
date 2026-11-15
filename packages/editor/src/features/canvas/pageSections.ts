/**
 * A page's top-level sections: the element children of the page's top-level element (`<main>`),
 * or, when its only content is an `<article>` (`<main>{% render 'header' %}<article>…</article>`),
 * that article's children: the places the drop rules let a `<section>` land. Page chrome (`<header>`,
 * `<footer>`) and non-visual elements are not sections; neither are `{% render %}` / `{% if %}`
 * nodes. The "+" lines between sections (`SectionPlusLines`) and the empty-page hint read it.
 */
import type { NodeHandle, Store } from "@pagehub/engine";

/** Elements that are page chrome, not a page's top-level element (`<html>` / `<body>`). */
const PAGE_LEVEL = new Set(["html", "body"]);
/** Children that are never a section: page chrome and elements that don't draw a band. */
const NOT_SECTION = new Set(["header", "footer", "script", "style", "template", "dialog", "link", "meta", "noscript"]);

export interface PageSections {
  /** The element the sections sit in. */
  parent: NodeHandle;
  sections: NodeHandle[];
}

const content = (h: NodeHandle): NodeHandle[] => h.children().filter((c) => c.kind === "element" && !NOT_SECTION.has(c.tag));

/** The top-level element above `h` (itself when it is one). */
export function pageRootOf(h: NodeHandle): NodeHandle {
  let root = h;
  for (let p = h.parent(); p; p = p.parent()) if (p.kind === "element" && !PAGE_LEVEL.has(p.tag)) root = p;
  return root;
}

/** The page file's top-level element, or null. */
export function pageRoot(store: Store, page: string): NodeHandle | null {
  return store.find(page, "*").find((h) => h.alive && !PAGE_LEVEL.has(h.tag) && pageRootOf(h) === h) ?? null;
}

/** The `<article>` a page wraps its sections in: `<main>`'s only content, or null. */
function pageArticle(root: NodeHandle): NodeHandle | null {
  const kids = content(root);
  return root.tag === "main" && kids.length === 1 && kids[0]!.tag === "article" ? kids[0]! : null;
}

export function pageSections(root: NodeHandle): PageSections {
  const article = pageArticle(root);
  return article ? { parent: article, sections: content(article) } : { parent: root, sections: content(root) };
}

/** True when `h` is the element a page's sections sit in. */
export function isSectionContainer(h: NodeHandle): boolean {
  if (!h.alive || h.kind !== "element" || PAGE_LEVEL.has(h.tag)) return false;
  const root = pageRootOf(h);
  return pageSections(root).parent === h;
}

export const sameSections = (a: PageSections | null, b: PageSections | null): boolean =>
  a === b || (!!a && !!b && a.parent === b.parent && a.sections.length === b.sections.length && a.sections.every((h, i) => h === b.sections[i]));
