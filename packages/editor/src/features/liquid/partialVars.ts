/**
 * What a partial reads from the tag that renders it: the variables its source uses that it
 * doesn't get from the site (`site`, `page`, a data source's global …) and doesn't define itself
 * (`assign`, `capture`, a `for` item). Those are the values `{% render 'card', title: "Hi" %}` can set.
 *
 *   partialVariables(`<h2>{{ title | default: "Hi" }}</h2>{% for i in items %}{{ i }}{% endfor %}`) // ["title", "items"]
 */
import { BUILTIN_OBJECTS } from "@pagehub/engine/render";

/** Names a partial gets without being passed anything, beyond the renderer's built-ins and the data sources' globals. */
const AMBIENT = new Set<string>([...BUILTIN_OBJECTS, "company", "year", "collections", "customer", "cart", "settings", "theme", "forloop", "tablerowloop", "paginate", "form", "section", "block"]);

/** Words of Liquid's expression syntax that look like names. */
const KEYWORDS = new Set(["and", "or", "contains", "true", "false", "nil", "null", "blank", "empty", "in", "reversed", "limit", "offset", "cols"]);

/** Tags whose first word is a keyword, not an expression. */
const BLOCK_END = /^end/;

const strip = (s: string): string =>
  s
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "")
    .replace(/\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/g, "")
    .replace(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/g, "");

/** Names an expression reads: leading identifiers, not properties, filters, argument keys or string text. */
function reads(expr: string): string[] {
  const bare = expr
    .replace(/"[^"]*"|'[^']*'/g, " ")
    .replace(/\|\s*[a-z_]\w*\s*:?/gi, " ")
    .replace(/\b[a-z_][\w-]*\s*:(?!:)/gi, " ")
    .replace(/\b\d[\w.]*/g, " ");
  return [...bare.matchAll(/(?<![\w.\]-])([a-z_]\w*)/gi)].map((m) => m[1]!);
}

/** The variables `source` uses and has to be given, in order of first use. */
export function partialVariables(source: string, extraGlobals: readonly string[] = []): string[] {
  const used: string[] = [];
  const own = new Set<string>();
  for (const m of strip(source).matchAll(/\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g)) {
    if (m[1] !== undefined) {
      used.push(...reads(m[1]));
      continue;
    }
    const tag = /^\s*([a-z_]\w*)\s*([\s\S]*)$/i.exec(m[2]!);
    if (!tag || BLOCK_END.test(tag[1]!)) continue;
    const [, name, rest] = tag as unknown as [string, string, string];
    if (name === "assign") {
      const a = /^([a-z_]\w*)\s*=([\s\S]*)$/i.exec(rest.trim());
      if (a) (own.add(a[1]!), used.push(...reads(a[2]!)));
    } else if (name === "capture" || name === "increment" || name === "decrement") {
      own.add(rest.trim());
    } else if (name === "for" || name === "tablerow") {
      const f = /^([a-z_]\w*)\s+in\s+([\s\S]*)$/i.exec(rest.trim());
      if (f) (own.add(f[1]!), used.push(...reads(f[2]!)));
    } else if (name === "render" || name === "include" || name === "section") {
      used.push(...reads(rest.replace(/^\s*(['"]).*?\1/, "").replace(/\b(for|with)\s+/g, " ").replace(/\bas\s+[a-z_]\w*/gi, " ")));
    } else if (/^(if|elsif|unless|case|when|echo|cycle)$/.test(name)) {
      used.push(...reads(rest));
    }
  }
  const skip = new Set([...extraGlobals, ...AMBIENT, ...KEYWORDS]);
  return [...new Set(used)].filter((n) => !own.has(n) && !skip.has(n));
}

/** The rows the panel shows: every variable the partial reads, then the arguments it doesn't (typed in by hand). */
export function valueRows(variables: readonly string[], args: readonly { name: string; source: string }[]): { name: string; source: string; custom: boolean }[] {
  const given = new Map(args.map((a) => [a.name, a.source]));
  const named = variables.map((name) => ({ name, source: given.get(name) ?? "", custom: false }));
  const extra = args.filter((a) => !variables.includes(a.name)).map((a) => ({ name: a.name, source: a.source, custom: true }));
  return [...named, ...extra];
}

/** A name a `render` argument can have. */
export const isValueName = (s: string): boolean => /^[a-z_][\w-]*$/i.test(s);
