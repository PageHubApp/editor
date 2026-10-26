/**
 * Unique ids on insert. Library markup carries fixed ids (a field's `id` and its label's `for`, a dialog's `id` and
 * the `commandfor` of its trigger, a tab panel's `data-tab-group`, `aria-controls`…), so inserting the same block
 * twice puts the same id on the page twice and the second copy's triggers open the first copy's targets.
 *
 * `uniqueIds` finds the names the snippet defines (`id`, `data-tab-group`), and for each one that the page already
 * defines gives the snippet a fresh name, rewriting every reference to it in the snippet (`for`, `commandfor`,
 * `popovertarget`, `aria-*`, `data-show-target`, `data-tab-target`, `data-tab-of`, `href="#name"`). A name nothing
 * on the page uses is left alone, so the first insert is verbatim. Names with Liquid in them (`faq-{{ i }}`) are
 * dynamic and left as written. Parsed with the engine's parser, never matched with a regex over the HTML.
 */
import { applySplices } from "../../edit/ops";
import { parserTagsFacet } from "../../extensions/facets";
import { NodeTypes, parseSource, type ElementNode, type LiquidHtmlNode, segmentsText, type ParseOptions, type Range } from "../../parse/parse";
import { buildTree, flattenTree } from "../../parse/tree";
import type { EditorState } from "../../state/state";

/** Attributes whose value is a name the element defines. */
const DEFINES = new Set(["id", "data-tab-group"]);
/** Attributes whose value is a whitespace-separated list of names defined elsewhere (plus `href="#name"`). */
const REFERS = new Set([
  "for", "form", "list", "headers", "commandfor", "popovertarget",
  "aria-controls", "aria-labelledby", "aria-describedby", "aria-owns", "aria-details", "aria-errormessage", "aria-activedescendant", "aria-flowto",
  "data-show-target", "data-tab-target", "data-tab-of",
]);

/**
 * Attributes that carry state-store keys. A widget keys its state by its root's id (`<id>:hasError`), so renaming the id
 * renames the prefix of every key derived from it: `data-state-*` (show / text / class…), `data-chat` / `data-chat-*`, and
 * `data-variable="state.<id>:…"`.
 */
const isStateKeyAttr = (name: string) => name.startsWith("data-state-") || name === "data-chat" || name.startsWith("data-chat-") || name === "data-variable";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `value` with each state-key prefix `<old>:` rewritten to `<new>:` for the renamed ids (a prefix, not a substring of another name). */
function renameStatePrefixes(value: string, rename: ReadonlyMap<string, string>): string {
  const re = new RegExp(`(^|[^A-Za-z0-9_-])(${[...rename.keys()].map(escapeRe).join("|")})(?=:)`, "g");
  return value.replace(re, (_m, pre: string, name: string) => pre + rename.get(name)!);
}

interface StaticAttr {
  name: string;
  /** The value's source range inside the quotes, when it is one static text node. */
  value: Range;
  raw: string;
}

/** An element's attributes whose name and value are plain text (no Liquid in either). */
function staticAttrs(el: ElementNode, source: string): StaticAttr[] {
  const out: StaticAttr[] = [];
  for (const a of el.attributes as LiquidHtmlNode[]) {
    if (a.type !== NodeTypes.AttrDoubleQuoted && a.type !== NodeTypes.AttrSingleQuoted && a.type !== NodeTypes.AttrUnquoted) continue;
    const name = segmentsText(a.name);
    const parts = a.value;
    if (name.includes("{{") || parts.length !== 1 || parts[0]!.type !== NodeTypes.TextNode) continue;
    const range = { start: parts[0]!.position.start, end: parts[0]!.position.end };
    out.push({ name, value: range, raw: source.slice(range.start, range.end) });
  }
  return out;
}

function elementsOf(source: string, env: ParseOptions["env"]): ElementNode[] {
  return flattenTree(buildTree(parseSource(source, "strict", { env }))).flatMap((n) => (n.kind === "element" ? [n.node] : []));
}

/** The names `source` defines. */
function definedIn(source: string, env: ParseOptions["env"]): string[] {
  const names: string[] = [];
  for (const el of elementsOf(source, env)) for (const a of staticAttrs(el, source)) if (DEFINES.has(a.name) && a.raw && !/\s/.test(a.raw)) names.push(a.raw);
  return names;
}

const isMarkup = (path: string) => /\.(html|liquid)$/.test(path);

/** `snippet` with the names the page already uses replaced by fresh ones; `snippet` itself when none collide. */
export function uniqueIds(state: EditorState, snippet: string): string {
  return uniqueIdsIn(state.files, snippet, state.facet(parserTagsFacet));
}

/**
 * `uniqueIds` over any set of files, with the parser environment that knows the site's block tags: for a host that
 * inserts a snippet with no editor open (a server placing a library block into a site's files).
 */
export function uniqueIdsIn(files: Iterable<readonly [string, string]>, snippet: string, env: ParseOptions["env"]): string {
  if (!/\b(?:id|data-tab-group)\s*=/.test(snippet)) return snippet; // nothing to define: skip the parse
  try {
    const mine = new Set(definedIn(snippet, env));
    if (!mine.size) return snippet;
    const taken = new Set<string>();
    for (const [path, text] of files) {
      if (!isMarkup(path)) continue;
      try {
        for (const name of definedIn(text, env)) taken.add(name);
      } catch {
        // a file that doesn't parse has no names we can read
      }
    }
    const rename = new Map<string, string>();
    for (const name of mine) {
      if (!taken.has(name)) continue;
      let n = 2;
      while (taken.has(`${name}-${n}`) || mine.has(`${name}-${n}`)) n++;
      const next = `${name}-${n}`;
      rename.set(name, next);
      taken.add(next);
    }
    if (!rename.size) return snippet;

    const splices: Array<{ from: number; to: number; insert: string }> = [];
    for (const el of elementsOf(snippet, env)) {
      for (const a of staticAttrs(el, snippet)) {
        let next: string | null = null;
        if (DEFINES.has(a.name)) next = rename.get(a.raw) ?? null;
        else if (REFERS.has(a.name)) {
          const tokens = a.raw.split(/(\s+)/).map((t) => rename.get(t) ?? t);
          next = tokens.join("");
        } else if (a.name === "href" && a.raw.startsWith("#")) {
          const to = rename.get(a.raw.slice(1));
          if (to) next = `#${to}`;
        } else if (isStateKeyAttr(a.name)) next = renameStatePrefixes(a.raw, rename);
        if (next !== null && next !== a.raw) splices.push({ from: a.value.start, to: a.value.end, insert: next });
      }
    }
    return splices.length ? applySplices(snippet, splices) : snippet;
  } catch {
    return snippet;
  }
}
