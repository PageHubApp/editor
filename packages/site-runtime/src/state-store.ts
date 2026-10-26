const vals = new Map<string, string>();
const subs = new Set<() => void>();
const LS = "ph-state:";

const store = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

let fieldReader: ((name: string) => string | undefined) | null = null;
/** The state chunk installs the `field:<name>` reader (a form control's live value) when a page gates on one. */
export const readFieldsWith = (fn: (name: string) => string | undefined) => void (fieldReader = fn);
/** Tell every subscriber something outside the store changed (a form field the visitor typed in). */
export const notify = () => subs.forEach((f) => f());

/** Current value of a state key, or `undefined`. `local:` keys come from localStorage (namespaced), `ls:` keys are a RAW localStorage key (what `set-local-storage` writes), `url:` keys from the query string, `field:` keys a form control's live value. */
export function get(key: string): string | undefined {
  if (key.startsWith("field:")) return fieldReader?.(key.slice(6));
  if (key.startsWith("ls:"))
    try {
      return store()?.getItem(key.slice(3)) ?? undefined;
    } catch {
      return undefined;
    }
  if (vals.has(key)) return vals.get(key);
  let v: string | null | undefined;
  try {
    if (key.startsWith("local:")) v = store()?.getItem(LS + key);
    else if (key.startsWith("url:")) v = new URLSearchParams(location.search).get(key.slice(4));
  } catch {
    /* storage unavailable: session only */
  }
  if (v != null) vals.set(key, v);
  return v ?? undefined;
}

/** Writes a key (`undefined` removes it) and tells every subscriber. Writing the same value is a no-op. */
export function set(key: string, value: string | undefined): void {
  if (get(key) === value) return;
  if (key.startsWith("ls:")) {
    try {
      value === undefined ? store()?.removeItem(key.slice(3)) : store()?.setItem(key.slice(3), value);
    } catch {
      /* storage unavailable */
    }
    subs.forEach((f) => f());
    return;
  }
  value === undefined ? vals.delete(key) : vals.set(key, value);
  // `get` falls back to the query string, so clearing a `url:` key must drop the param too or the value reads straight back.
  if (value === undefined && key.startsWith("url:"))
    try {
      const u = new URL(location.href);
      if (u.searchParams.has(key.slice(4))) {
        u.searchParams.delete(key.slice(4));
        history.replaceState(history.state, "", u);
      }
    } catch {
      /* no history: session only */
    }
  if (key.startsWith("local:"))
    try {
      value === undefined ? store()?.removeItem(LS + key) : store()?.setItem(LS + key, value);
    } catch {
      /* session only */
    }
  subs.forEach((f) => f());
}

/** The keys written this session (not the URL's or localStorage's own): how a dynamic family (`url:facet.*`) is listed. */
export function keys(): string[] {
  return [...vals.keys()];
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/**
 * A `{{state.<token>}}` value: the registry key ends at the first `.` after the last `:`, and the rest walks into the
 * key's JSON value (`pdp:current:matching-variant.formatted`). A plain key is its string. Missing parts give `""`.
 */
export function getPath(token: string): string {
  const dot = token.indexOf(".", token.lastIndexOf(":") + 1);
  const raw = get(dot < 0 ? token : token.slice(0, dot)) ?? "";
  if (dot < 0 || !raw) return raw;
  try {
    let v: any = JSON.parse(raw);
    for (const part of token.slice(dot + 1).split(".")) v = v?.[part];
    return v == null ? "" : String(v);
  } catch {
    return "";
  }
}

export const truthy = (v: string | undefined) => v !== undefined && v !== "" && v !== "false";

// A key is one or more `[\w.-]+` segments joined by `:` (`store:filter`, `form:x:fields`), with an
// optional `local:` / `url:` prefix. Colon-namespaced keys are first-class here, so a `data-state-set`
// / `data-state-show` can carry them (e.g. a filter chip writing `store:filter`).
const COND = /^(!)?((?:local:|url:|ls:)?[\w.-]+(?::[\w.-]+)*)(?:(!=|\*=|>=|<=|=|>|<)(.*))?$/;

/**
 * One atom: `key=v`, `key!=v`, `key`, `!key`, `key>3` (also `<`, `>=`, `<=`; numeric when both sides are numbers),
 * `key*=v` (the value contains `v`). A leading `!` negates any atom: `!key*=v` is "doesn't contain".
 */
function testOne(expr: string): boolean {
  const m = COND.exec(expr.trim());
  if (!m) return false;
  const [, not, key, op, rhs = ""] = m;
  const v = get(key!) ?? (getPath(key!) || undefined); // `key.field` walks into a JSON value (a matched variant's `.image`)
  if (!op) return truthy(v) !== !!not;
  const cur = v ?? "";
  const num = cur !== "" && rhs !== "" && !isNaN(+cur) && !isNaN(+rhs);
  const [a, b] = num ? [+cur, +rhs] : [cur, rhs];
  const r = op === "*=" ? cur.includes(rhs) : op === "=" ? a === b : op === "!=" ? a !== b : op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : a <= b;
  return r !== !!not;
}

/**
 * A full show/class test. Top-level `||` is OR, `&&` is AND (AND binds tighter), so a `data-state-show`
 * can carry a disjunctive-normal-form gate like `!store:filter||store:filter=all||store:filter=people`
 * (a node whose `conditionGroups` map to several runtime `state` conditions). A single atom with no
 * `||` / `&&` — every pre-existing expression — parses exactly as before.
 */
export function test(expr: string): boolean {
  return expr.split("||").some((or) => or.split("&&").every((and) => testOne(and)));
}

/**
 * `"store:filter:all"` → `["store:filter", "all"]`: the value is the LAST colon-separated segment, the
 * key everything before it — so a namespaced set (`store:filter` = `all`) round-trips. A `local:` / `url:`
 * prefix is never the split point, so `"url:q"` stays `["url:q", undefined]` and `"local:tab:b"` →
 * `["local:tab", "b"]`. A single-colon string (`"store:filter"`, `"tab"`) is unchanged from before.
 */
export function splitKey(s: string): [string, string | undefined] {
  const p = /^(?:local:|url:|ls:)/.exec(s)?.[0] ?? "";
  const i = s.lastIndexOf(":");
  return i < p.length ? [s.trim(), undefined] : [s.slice(0, i).trim(), s.slice(i + 1)];
}
