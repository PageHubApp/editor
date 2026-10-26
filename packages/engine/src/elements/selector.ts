/**
 * CSS-like selectors over the source tree: `section.hero`, `#service-grid > article`,
 * `[data-section=hero]`, `img[alt]`, `a, button`. A Liquid tag is matched with a `%`
 * prefix: `%for`, `%section`, `%map .pin`. Combinators: descendant (space) and child (`>`).
 * Attribute operators: `=`, `~=`, `^=`, `$=`, `*=`.
 */
import { findAttribute } from "../edit/ops";
import { NodeTypes } from "../parse/parse";
import type { TreeNode } from "../parse/tree";

/** What a selector needs from a parsed file. */
export interface SelectorTree {
  readonly text: string;
  parent(n: TreeNode): TreeNode | null;
}

interface AttrTest {
  name: string;
  op?: "=" | "~=" | "^=" | "$=" | "*=";
  value?: string;
}

interface Compound {
  tag?: string;
  liquid?: string;
  id?: string;
  classes: string[];
  attrs: AttrTest[];
}

type Complex = Array<{ compound: Compound; combinator: " " | ">" | null }>;

export type Matcher = (n: TreeNode, tree: SelectorTree) => boolean;

const TOKEN = /\s*(>)\s*|\s+|(%?[\w*-][\w-]*)|#([\w-]+)|\.([\w:/[\]%.-]+?)(?=[.#[\s>]|$)|\[\s*([\w:-]+)\s*(?:([~^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/y;

function parseComplex(src: string): Complex {
  const out: Complex = [];
  let cur: Compound = { classes: [], attrs: [] };
  let empty = true;
  let pending: " " | ">" | null = null;
  const flush = () => {
    if (empty) return;
    out.push({ compound: cur, combinator: out.length ? pending ?? " " : null });
    cur = { classes: [], attrs: [] };
    empty = true;
    pending = null;
  };
  const s = src.trim();
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(s);
    if (!m || m.index !== at) throw new Error(`bad selector "${src}" at ${at}`);
    if (m[1] || /^\s+$/.test(m[0])) {
      flush();
      if (m[1]) pending = ">";
      continue;
    }
    empty = false;
    if (m[2]) {
      if (m[2].startsWith("%")) cur.liquid = m[2].slice(1);
      else if (m[2] !== "*") cur.tag = m[2].toLowerCase();
    } else if (m[3]) cur.id = m[3];
    else if (m[4]) cur.classes.push(m[4]);
    else if (m[5]) cur.attrs.push({ name: m[5], op: m[6] as AttrTest["op"], value: m[7] ?? m[8] ?? m[9] });
  }
  flush();
  if (!out.length) throw new Error(`empty selector "${src}"`);
  return out;
}

function attrOf(n: TreeNode, tree: SelectorTree, name: string): string | undefined {
  if (n.kind !== "element") return undefined;
  const a = findAttribute(n.node, name);
  if (!a) return undefined;
  return "attributePosition" in a ? tree.text.slice(a.attributePosition.start, a.attributePosition.end) : "";
}

function matchCompound(c: Compound, n: TreeNode, tree: SelectorTree): boolean {
  if (c.liquid !== undefined) {
    const name = n.kind === "liquid-block" ? n.tag : n.kind === "content" && n.type === NodeTypes.LiquidTag ? (n.node as { name: string }).name : null;
    if (name !== c.liquid) return false;
  } else if (n.kind !== "element" || (c.tag && n.tag !== c.tag)) return false;
  if (c.id !== undefined && attrOf(n, tree, "id") !== c.id) return false;
  if (c.classes.length) {
    const cls = (attrOf(n, tree, "class") ?? "").split(/\s+/);
    if (!c.classes.every((x) => cls.includes(x))) return false;
  }
  for (const a of c.attrs) {
    const v = attrOf(n, tree, a.name);
    if (v === undefined) return false;
    if (!a.op) continue;
    const want = a.value ?? "";
    const ok =
      a.op === "=" ? v === want : a.op === "~=" ? v.split(/\s+/).includes(want) : a.op === "^=" ? v.startsWith(want) : a.op === "$=" ? v.endsWith(want) : v.includes(want);
    if (!ok) return false;
  }
  return true;
}

function matchComplex(parts: Complex, n: TreeNode, tree: SelectorTree): boolean {
  const go = (i: number, node: TreeNode): boolean => {
    if (!matchCompound(parts[i]!.compound, node, tree)) return false;
    if (i === 0) return true;
    const comb = parts[i]!.combinator;
    let p = tree.parent(node);
    if (comb === ">") return !!p && go(i - 1, p);
    for (; p; p = tree.parent(p)) if (go(i - 1, p)) return true;
    return false;
  };
  return go(parts.length - 1, n);
}

const cache = new Map<string, Matcher>();

export function compileSelector(selector: string): Matcher {
  let m = cache.get(selector);
  if (!m) {
    const list = selector.split(",").map(parseComplex);
    m = (n, tree) => list.some((c) => matchComplex(c, n, tree));
    cache.set(selector, m);
  }
  return m;
}
