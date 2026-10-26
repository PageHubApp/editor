/**
 * What a site's stylesheets can do to the layout of an element, as far as the formatter (`format.ts`) needs to know:
 * the `display` values a rule may give it, whether it may leave the flow (`position: absolute | fixed`, `float`),
 * whether its white-space may be preserved (`pre`, `pre-line`, …) and whether a `::before` / `::after` may give it
 * generated content. Tailwind's own utilities are modelled directly (`layout.ts`); this covers every other rule:
 * component CSS (DaisyUI), the site's `theme.css` and its `<style>` blocks.
 *
 * Every answer over-approximates. A rule that applies only on hover, inside `.menu` or in a media query still adds its
 * values; a selector the scanner can't attribute to a class, tag, id or attribute (`* { white-space: pre }`) sets
 * `global`, and a site with a global hint is not formatted at all.
 */

/** One rule set's effect on the elements it selects. */
export interface LayoutHint {
  /** `display` values a rule may give the element (lowercase, `unknown` for `var()` & co). */
  display: Set<string>;
  outOfFlow: boolean;
  floats: boolean;
  pre: boolean;
  /** A `::before` / `::after` / `::marker` rule targets it: generated content may sit at its edges. */
  pseudo: boolean;
  /** A rule targets its descendants (`.join > *`): nothing below it has a known layout. */
  descendants: boolean;
}

export interface LayoutHints {
  classes: Map<string, LayoutHint>;
  tags: Map<string, LayoutHint>;
  ids: Map<string, LayoutHint>;
  attrs: Map<string, LayoutHint>;
  /** A rule no element can be told apart from (`*`, `:not(.x)`, a remote stylesheet): format nothing. */
  global: boolean;
}

export function emptyHints(): LayoutHints {
  return { classes: new Map(), tags: new Map(), ids: new Map(), attrs: new Map(), global: false };
}

const blankHint = (): LayoutHint => ({ display: new Set(), outOfFlow: false, floats: false, pre: false, pseudo: false, descendants: false });

/** Remote stylesheets that only declare `@font-face`. */
const FONT_ONLY_HOSTS = /^(https?:)?\/\/fonts\.(googleapis|bunny)\.(com|net)\//i;

/** Add what `css` can do to `hints` (mutates and returns it). */
export function scanCss(css: string, hints: LayoutHints = emptyHints()): LayoutHints {
  if (/\{\{|\{%/.test(css)) {
    // Liquid inside a stylesheet: the rule text isn't known until render.
    hints.global = true;
    return hints;
  }
  try {
    scanRules(stripComments(css), [], hints, 0);
  } catch {
    // A stylesheet the scanner can't read (a recursion it can't finish): nothing is proven, so nothing is formatted.
    hints.global = true;
  }
  return hints;
}

/**
 * Rules nested deeper than this are not read: a site's CSS nests a few levels, and an unclosed `a{a{a{…` would
 * otherwise recurse once per brace (stack overflow, quadratic time).
 */
const MAX_RULE_DEPTH = 32;

/** `css` without its comments, in one pass (an unclosed `/*` ends the text, as in a browser). */
function stripComments(css: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const open = css.indexOf("/*", from);
    if (open < 0) return out + css.slice(from);
    out += css.slice(from, open);
    const close = css.indexOf("*/", open + 2);
    if (close < 0) return out;
    from = close + 2;
  }
}

/** Skip a quoted string or a bracketed run starting at `i`; returns the index after it. */
function skipNested(text: string, i: number): number {
  const ch = text[i]!;
  if (ch === '"' || ch === "'") {
    let j = i + 1;
    while (j < text.length && text[j] !== ch) j += text[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  const close = ch === "(" ? ")" : "]";
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j]!;
    if (c === '"' || c === "'") {
      j = skipNested(text, j) - 1;
      continue;
    }
    if (c === ch) depth++;
    else if (c === close && --depth === 0) return j + 1;
  }
  return text.length;
}

interface Block {
  prelude: string;
  body: string;
}

/** Split a rule list into `prelude { body }` blocks and the statements between them (`@import …;`). */
function splitBlocks(text: string): { blocks: Block[]; statements: string[] } {
  const blocks: Block[] = [];
  const statements: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "(" || c === "[") {
      i = skipNested(text, i);
      continue;
    }
    if (c === ";") {
      statements.push(text.slice(start, i).trim());
      start = ++i;
      continue;
    }
    if (c === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth) {
        const d = text[j]!;
        if (d === '"' || d === "'") {
          j = skipNested(text, j);
          continue;
        }
        if (d === "{") depth++;
        else if (d === "}") depth--;
        j++;
      }
      blocks.push({ prelude: text.slice(start, i).trim(), body: text.slice(i + 1, j - 1) });
      start = i = j;
      continue;
    }
    if (c === "}") {
      start = ++i;
      continue;
    }
    i++;
  }
  const tail = text.slice(start).trim();
  if (tail) statements.push(tail);
  return { blocks, statements };
}

const SKIP_AT_RULES = /^@(-[a-z]+-)?(keyframes|font-face|property|page|counter-style|font-feature-values|font-palette-values|view-transition|theme|custom-variant|source|plugin|config|tailwind|variant)\b/i;
const GROUP_AT_RULES = /^@(media|supports|container|layer|scope|starting-style|document)\b/i;

function scanStatements(statements: readonly string[], hints: LayoutHints): void {
  for (const s of statements) {
    const m = /^@import\s+(?:url\(\s*)?["']?([^"')\s]+)/i.exec(s);
    if (m && !FONT_ONLY_HOSTS.test(m[1]!)) hints.global = true;
  }
}

function scanRules(text: string, parents: readonly string[], hints: LayoutHints, depth: number): void {
  if (depth > MAX_RULE_DEPTH) {
    hints.global = true;
    return;
  }
  const { blocks, statements } = splitBlocks(text);
  scanStatements(statements, hints);
  for (const { prelude, body } of blocks) {
    if (prelude.startsWith("@")) {
      if (SKIP_AT_RULES.test(prelude)) continue;
      const utility = /^@utility\s+([\w-]+)/i.exec(prelude);
      if (utility) {
        scanStyleRule(`.${utility[1]}`, body, parents, hints, depth);
        continue;
      }
      if (GROUP_AT_RULES.test(prelude)) {
        scanRules(body, parents, hints, depth + 1);
        continue;
      }
      // An at-rule the scanner doesn't know: its rules can't be attributed.
      hints.global = true;
      continue;
    }
    scanStyleRule(prelude, body, parents, hints, depth);
  }
}

/** A style rule: its own declarations, then any nested rules (CSS nesting) under the resolved selector. */
function scanStyleRule(prelude: string, body: string, parents: readonly string[], hints: LayoutHints, depth: number): void {
  const selectors = resolveNested(splitTopLevel(prelude, ","), parents);
  const { blocks, statements } = splitBlocks(body);
  const effect = declarationEffect(statements.join(";"));
  for (const selector of selectors) applySelector(selector, effect, hints);
  if (blocks.length) scanRules(blocks.map((b) => `${b.prelude}{${b.body}}`).join("\n"), selectors, hints, depth + 1);
}

function resolveNested(selectors: readonly string[], parents: readonly string[]): string[] {
  if (!parents.length) return selectors.map((s) => s.trim()).filter(Boolean);
  const parent = `:is(${parents.join(",")})`;
  return selectors
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes("&") ? s.replace(/&/g, parent) : `${parent} ${s}`));
}

/** Split on `sep` outside quotes, parentheses and brackets. */
export function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "(" || c === "[") {
      i = skipNested(text, i);
      continue;
    }
    if (c === sep) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  out.push(text.slice(start));
  return out;
}

interface DeclarationEffect {
  display: Set<string>;
  outOfFlow: boolean;
  floats: boolean;
  pre: boolean;
  any: boolean;
  /** Sets `content` (on a pseudo-element: generated content). */
  content: boolean;
}

/** What a rule's own declarations do to layout. `@apply` and `all:` reset everything to unknown. */
function declarationEffect(decls: string): DeclarationEffect {
  const effect: DeclarationEffect = { display: new Set(), outOfFlow: false, floats: false, pre: false, any: false, content: false };
  for (const raw of splitTopLevel(decls, ";")) {
    const decl = raw.trim();
    if (!decl) continue;
    if (/^@apply\b/i.test(decl)) {
      Object.assign(effect, { outOfFlow: true, floats: true, pre: true, any: true, content: true });
      effect.display.add("unknown");
      continue;
    }
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).replace(/!important/i, "").trim().toLowerCase();
    const known = !/\b(var|env|attr|if)\(|^(inherit|initial|unset|revert|revert-layer)$/.test(value);
    if (prop === "display") {
      effect.display.add(known ? value : "unknown");
      effect.any = true;
    } else if (prop === "all") {
      effect.display.add("unknown");
      Object.assign(effect, { outOfFlow: true, floats: true, pre: true, any: true });
    } else if (prop === "position") {
      if (!known || value === "absolute" || value === "fixed") effect.outOfFlow = true;
      effect.any = true;
    } else if (prop === "float") {
      if (!known || value !== "none") effect.floats = true;
      effect.any = true;
    } else if (prop === "white-space" || prop === "white-space-collapse") {
      if (!known || /pre|break-spaces|preserve/.test(value)) effect.pre = true;
      effect.any = true;
    } else if (prop === "content" && value !== "none" && value !== "normal") effect.content = true;
  }
  return effect;
}

const PSEUDO_CONTENT = /::?(before|after)\b|::marker\b/i;
const OTHER_PSEUDO_ELEMENT = /::[\w-]+/;

/** Record `effect` on whatever `selector` can select. */
function applySelector(selector: string, effect: DeclarationEffect, hints: LayoutHints): void {
  const compounds = splitCompounds(selector);
  const last = compounds.at(-1);
  if (!last) return;
  const onPseudo = PSEUDO_CONTENT.test(last);
  // `::placeholder`, `::selection` & co. style a part of the element that holds no markup.
  if (!onPseudo && OTHER_PSEUDO_ELEMENT.test(last)) return;
  // A `::before` matters only when it generates content; then it is an edge of the element, whatever its display.
  const pseudo = onPseudo && effect.content;
  if (onPseudo ? !pseudo : !effect.any) return;
  const subject = last.replace(/::?(before|after|first-line|first-letter)\b|::[\w-]+(\([^)]*\))?/gi, "");
  const targets = targetsOf(subject, compounds.slice(0, -1));
  if (targets === "global") {
    hints.global = true;
    return;
  }
  // `html`, `body`, `:root`: they hold every file's markup, so only an inherited `white-space` matters.
  if (targets === "root") {
    if (effect.pre) hints.global = true;
    return;
  }
  for (const t of targets) {
    const map = t.kind === "class" ? hints.classes : t.kind === "tag" ? hints.tags : t.kind === "id" ? hints.ids : hints.attrs;
    let hint = map.get(t.name);
    if (!hint) map.set(t.name, (hint = blankHint()));
    if (t.descendants) {
      hint.descendants = true;
      continue;
    }
    if (pseudo) {
      hint.pseudo = true;
      continue;
    }
    for (const d of effect.display) hint.display.add(d);
    hint.outOfFlow ||= effect.outOfFlow;
    hint.floats ||= effect.floats;
    hint.pre ||= effect.pre;
  }
}

/** Compounds of a complex selector, split at the top-level combinators. */
function splitCompounds(selector: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const s = selector.trim();
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      cur += s.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "(" || c === "[") {
      const j = skipNested(s, i);
      cur += s.slice(i, j);
      i = j;
      continue;
    }
    if (/[\s>+~]/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur) out.push(cur);
  return out;
}

type Target = { kind: "class" | "tag" | "id" | "attr"; name: string; descendants: boolean };

const ROOT_TAGS = new Set(["html", "body", ":root"]);

/** The elements a compound selects, "root" for the document's own `html` / `body`, or "global". `ancestors` are the compounds before it. */
function targetsOf(subject: string, ancestors: readonly string[], descendants = false): Target[] | "global" | "root" {
  const parsed = parseCompound(subject);
  const own: Target[] = [];
  if (parsed.tag && parsed.tag !== "*" && !ROOT_TAGS.has(parsed.tag)) own.push({ kind: "tag", name: parsed.tag, descendants });
  for (const name of parsed.classes) own.push({ kind: "class", name, descendants });
  for (const name of parsed.ids) own.push({ kind: "id", name, descendants });
  for (const name of parsed.attrs) own.push({ kind: "attr", name, descendants });
  if (own.length) return own;
  if (!descendants && (parsed.root || (parsed.tag && ROOT_TAGS.has(parsed.tag)))) return "root";
  const fromArgs: Target[] = [];
  for (const arg of parsed.isArgs) {
    for (const sel of splitTopLevel(arg, ",")) {
      const compounds = splitCompounds(sel);
      const t = compounds.length ? targetsOf(compounds.at(-1)!, compounds.slice(0, -1), descendants) : "global";
      if (t === "global" || t === "root") return "global";
      fromArgs.push(...t);
    }
  }
  if (fromArgs.length) return fromArgs;
  // `.join > *`, `.menu :first-child`: everything below the ancestor.
  const parent = ancestors.at(-1);
  if (parent) return targetsOf(parent, ancestors.slice(0, -1), true);
  return "global";
}

interface Compound {
  tag: string | null;
  classes: string[];
  ids: string[];
  attrs: string[];
  /** Selector arguments of `:is()` / `:where()` / `:matches()` / `:any()`. */
  isArgs: string[];
  /** `:root` (the document element). */
  root: boolean;
}

const IDENT = /^(?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w\- -￿])+/;

function unescapeIdent(raw: string): string {
  return raw.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex: string | undefined, ch: string | undefined) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch!));
}

function parseCompound(text: string): Compound {
  const out: Compound = { tag: null, classes: [], ids: [], attrs: [], isArgs: [], root: false };
  let i = 0;
  const tag = /^(\*|[a-zA-Z][\w-]*)/.exec(text);
  if (tag) {
    out.tag = tag[1]!.toLowerCase();
    i = tag[0].length;
  }
  while (i < text.length) {
    const c = text[i]!;
    if (c === "." || c === "#") {
      const m = IDENT.exec(text.slice(i + 1));
      if (!m) {
        i++;
        continue;
      }
      (c === "." ? out.classes : out.ids).push(unescapeIdent(m[0]));
      i += 1 + m[0].length;
      continue;
    }
    if (c === "[") {
      const j = skipNested(text, i);
      const name = /^\[\s*([\w\-:|]+)/.exec(text.slice(i, j))?.[1];
      if (name) out.attrs.push(name.replace(/^.*\|/, "").toLowerCase());
      i = j;
      continue;
    }
    if (c === ":") {
      const m = /^::?([\w-]+)/.exec(text.slice(i));
      if (!m) {
        i++;
        continue;
      }
      const name = m[1]!.toLowerCase();
      i += m[0].length;
      if (text[i] === "(") {
        const j = skipNested(text, i);
        if (name === "is" || name === "where" || name === "matches" || name === "any" || name.endsWith("-any")) out.isArgs.push(text.slice(i + 1, j - 1));
        i = j;
      } else if (name === "root") out.root = true;
      continue;
    }
    i++;
  }
  return out;
}
