/**
 * `when` expressions: identifiers, `!`, `&&`, `||`, `==`, `!=`, parentheses, string and
 * number literals, `true` / `false`. Identifiers read the UI context (`selection`,
 * `textEditing`, `focus`, `paletteOpen`, `mediaManagerOpen`, `role`, `readOnly`, plus
 * contributed keys); a missing one is undefined (falsy).
 */
type Node =
  | { t: "id"; name: string }
  | { t: "lit"; value: string | number | boolean }
  | { t: "not"; e: Node }
  | { t: "and" | "or" | "eq" | "ne"; a: Node; b: Node };

const TOKENS = /\s*(?:(&&|\|\||==|!=|!|\(|\))|'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|([A-Za-z_][\w.:-]*))/y;

export class WhenError extends Error {
  override name = "WhenError";
}

const cache = new Map<string, Node>();

export function parseWhen(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const toks: Array<{ op?: string; lit?: string | number | boolean; id?: string }> = [];
  TOKENS.lastIndex = 0;
  const s = src.trimEnd();
  while (TOKENS.lastIndex < s.length) {
    const at = TOKENS.lastIndex;
    const m = TOKENS.exec(s);
    if (!m) throw new WhenError(`bad "when" expression "${src}" at ${at}`);
    if (m[1]) toks.push({ op: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) toks.push({ lit: m[2] ?? m[3]! });
    else if (m[4]) toks.push({ lit: Number(m[4]) });
    else if (m[5] === "true" || m[5] === "false") toks.push({ lit: m[5] === "true" });
    else toks.push({ id: m[5]! });
  }
  let i = 0;
  const peek = (op: string) => toks[i]?.op === op;
  const or = (): Node => {
    let a = and();
    while (peek("||")) i++, (a = { t: "or", a, b: and() });
    return a;
  };
  const and = (): Node => {
    let a = unary();
    while (peek("&&")) i++, (a = { t: "and", a, b: unary() });
    return a;
  };
  const unary = (): Node => (peek("!") ? (i++, { t: "not", e: unary() }) : cmp());
  const cmp = (): Node => {
    const a = primary();
    if (peek("==") || peek("!=")) {
      const t = toks[i++]!.op === "==" ? "eq" : "ne";
      return { t, a, b: primary() };
    }
    return a;
  };
  const primary = (): Node => {
    const tok = toks[i++];
    if (!tok) throw new WhenError(`unexpected end of "when" expression "${src}"`);
    if (tok.op === "(") {
      const e = or();
      if (!peek(")")) throw new WhenError(`missing ) in "${src}"`);
      i++;
      return e;
    }
    if (tok.id !== undefined) return { t: "id", name: tok.id };
    if (tok.lit !== undefined) return { t: "lit", value: tok.lit };
    throw new WhenError(`unexpected "${tok.op}" in "${src}"`);
  };
  const ast = or();
  if (i < toks.length) throw new WhenError(`unexpected "${toks[i]!.op ?? toks[i]!.id ?? toks[i]!.lit}" in "${src}"`);
  cache.set(src, ast);
  return ast;
}

function evalNode(n: Node, ctx: Record<string, unknown>): unknown {
  switch (n.t) {
    case "id":
      return ctx[n.name];
    case "lit":
      return n.value;
    case "not":
      return !evalNode(n.e, ctx);
    case "and":
      return evalNode(n.a, ctx) && evalNode(n.b, ctx);
    case "or":
      return evalNode(n.a, ctx) || evalNode(n.b, ctx);
    case "eq":
      return evalNode(n.a, ctx) === evalNode(n.b, ctx);
    case "ne":
      return evalNode(n.a, ctx) !== evalNode(n.b, ctx);
  }
}

/** Evaluate a `when` expression; an absent expression passes. */
export function evaluateWhen(src: string | undefined, ctx: Record<string, unknown>): boolean {
  return src === undefined || src.trim() === "" ? true : !!evalNode(parseWhen(src), ctx);
}
