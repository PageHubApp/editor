import { CHUNK_SELECTORS } from "./chunks";

/** Attributes the inline behaviours in `src/core/` act on. They have no lazy chunk, so they are not in `CHUNK_SELECTORS`; keep in step with that folder. */
export const CORE_SELECTORS = ["form[data-autosubmit]", "[data-copy]", "[data-dismiss]", "[data-theme-toggle]", "dialog[closedby]"] as const;

const ALL: readonly string[] = [...Object.values(CHUNK_SELECTORS), ...CORE_SELECTORS];

/** Every element the runtime acts on, as one CSS selector. Derived from `CHUNK_SELECTORS` + `CORE_SELECTORS`, so it cannot drift from them. */
export const RUNTIME_SELECTOR = ALL.join(",");

interface Rule {
  tag?: string;
  name: string;
  value?: string;
}

/** `button[commandfor]` / `[popover="manual"]` / `[a]:not([b])` → rules. A `:not(...)` only narrows, so it is dropped (a page can only over-include). */
function parseRules(selectors: readonly string[]): Rule[] {
  const rules: Rule[] = [];
  for (const group of selectors) {
    for (const part of group.replace(/:not\([^)]*\)/g, "").split(",")) {
      const m = /^([a-z][a-z0-9-]*)?\[([a-z][a-z0-9-]*)(?:=(?:"([^"]*)"|([^\]]*)))?\]$/i.exec(part.trim());
      if (m) rules.push({ tag: m[1]?.toLowerCase(), name: m[2]!.toLowerCase(), value: m[3] ?? m[4] });
      else throw new Error(`Unsupported runtime selector: ${part}`);
    }
  }
  return rules;
}

const RULES = parseRules(ALL);
const TAG = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Does this HTML use anything the runtime handles? Matches the opening tags against the same selectors as
 * `RUNTIME_SELECTOR`, so a page that uses none of them ships no script. Errs towards "yes": it is a text scan, not a DOM,
 * so an attribute inside a comment or a `<script>` string counts.
 */
export function needsRuntime(html: string): boolean {
  for (const t of html.matchAll(TAG)) {
    const tag = t[1]!.toLowerCase();
    for (const a of t[2]!.matchAll(ATTR)) {
      const name = a[1]!.toLowerCase();
      const value = a[2] ?? a[3] ?? a[4];
      if (RULES.some((r) => r.name === name && (!r.tag || r.tag === tag) && (r.value === undefined || r.value === value))) return true;
    }
  }
  return false;
}
