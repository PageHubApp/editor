/**
 * The elements that carry `data-edit-id` under persisted identity. The html kit owns
 * this list; `identity/persisted.ts` re-exports it as `DEFAULT_ID_ELEMENTS` and the editor
 * reads the configured set through `idElementsFacet` (union of every contribution; the html
 * list when nothing is configured).
 */
import { defineFacet } from "../../extensions/extension";

export const HTML_ID_ELEMENTS: ReadonlySet<string> = new Set(
  "section header footer nav main article aside div h1 h2 h3 h4 h5 h6 p blockquote figure figcaption img picture video audio iframe svg a button form input select textarea label fieldset ul ol li dl table thead tbody tr td th details summary dialog".split(" "),
);

export const idElementsFacet = defineFacet<ReadonlySet<string>, ReadonlySet<string>>({
  id: "idElements",
  combine: (values) => (values.length ? new Set(values.flatMap((s) => [...s])) : HTML_ID_ELEMENTS),
});
