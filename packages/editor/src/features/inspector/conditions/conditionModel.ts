/**
 * Visibility conditions in their HTML-first forms — the same forms the source converter
 * (pagehub.dev `packages/sdk/src/render/source/conditions.ts`) emits, read back into the old
 * editor's condition model (type + key + operator + value, in all / any groups):
 *
 *   server   `{% if a and b %}…{% endif %}` around the element  url-param, auth, company, item,
 *            (Liquid has no parentheses: one group, all = and,    connector (a hand-written
 *            any = or)                                            `request.form.*` still reads back)
 *   browser  `data-state-show="a&&b||c"` (the runtime's test(): state, localStorage, form-field
 *            `||` of `&&` groups; a form field is `field:<name>`, (another field's live value)
 *            contains is `*=`)
 *   device   `md:hidden` (mobile only) / `max-md:hidden`           device
 *            (desktop only) on the element
 *
 *   parseServer("customer.isMember == true and item.image != blank")
 *     // → { logic: "all", conds: [{ type: "auth", key: "isMember", op: "equals", value: "true" }, …] }
 *   serializeShow([{ logic: "all", conds: [{ type: "state", key: "cart:open", op: "exists", value: "" }] }])
 *     // → "cart:open"
 */

export type CondType = "url-param" | "form-field" | "connector" | "company" | "device" | "auth" | "item" | "localStorage" | "state";
export type Op = "equals" | "not-equals" | "contains" | "not-contains" | "exists" | "not-exists" | "greater-than" | "less-than";
export type Logic = "all" | "any";

export interface Cond {
  type: CondType;
  key: string;
  op: Op;
  value: string;
}
export interface Group {
  logic: Logic;
  conds: Cond[];
}

/** Where a condition type is decided. */
export type Place = "server" | "browser" | "device";
export const PLACE_OF: Record<CondType, Place> = {
  "url-param": "server",
  "form-field": "browser",
  connector: "server",
  company: "server",
  auth: "server",
  item: "server",
  state: "browser",
  localStorage: "browser",
  device: "device",
};

/** The types decided by a Liquid `{% if %}` (the Conditions section and an action's gate offer these). */
export const SERVER_TYPES: CondType[] = ["auth", "url-param", "item", "company", "connector"];

export const TYPE_LABELS: Record<CondType, string> = {
  "url-param": "URL parameter",
  "form-field": "Form field",
  connector: "Connector data",
  company: "Company info",
  device: "Device",
  auth: "Signed-in customer",
  item: "Current item",
  localStorage: "Local storage",
  state: "State",
};

export const TYPE_HELP: Record<CondType, string> = {
  "url-param": "A query-string value, e.g. ?ref=templates",
  "form-field": "What the visitor has typed or picked in another field, e.g. topic",
  connector: "A connector or collection value, e.g. collections.plants.size",
  company: "A site setting, e.g. logo or phone",
  device: "Phone or desktop width",
  auth: "Signed in, signed out, or a customer field",
  item: "A field of the repeated row",
  localStorage: "A value saved in the visitor's browser",
  state: "A live state key, e.g. cart:open",
};

export const OPS_BY_TYPE: Record<CondType, Op[]> = {
  "url-param": ["equals", "not-equals", "contains", "not-contains", "exists", "not-exists"],
  "form-field": ["equals", "not-equals", "contains", "not-contains", "exists", "not-exists"],
  connector: ["exists", "not-exists", "greater-than", "less-than", "equals"],
  company: ["exists", "not-exists", "equals", "not-equals"],
  device: ["equals"],
  auth: ["equals", "not-equals", "exists", "not-exists", "greater-than", "less-than"],
  item: ["exists", "not-exists", "equals", "not-equals", "contains", "greater-than", "less-than"],
  localStorage: ["exists", "not-exists", "equals", "not-equals"],
  state: ["equals", "not-equals", "exists", "not-exists", "greater-than", "less-than"],
};

export const OP_LABELS: Record<Op, string> = {
  equals: "Equals",
  "not-equals": "Not equals",
  contains: "Contains",
  "not-contains": "Doesn't contain",
  exists: "Exists",
  "not-exists": "Doesn't exist",
  "greater-than": "Greater than",
  "less-than": "Less than",
};

export const NO_VALUE: ReadonlySet<Op> = new Set(["exists", "not-exists"]);

/** A fresh condition of a type, with its first operator. Auth starts as "signed in". */
export function newCond(type: CondType): Cond {
  if (type === "auth") return { type, key: "status", op: "equals", value: "logged-in" };
  if (type === "device") return { type, key: "viewport", op: "equals", value: "mobile" };
  return { type, key: "", op: OPS_BY_TYPE[type][0]!, value: "" };
}

// ── server: Liquid {% if %} ────────────────────────────────────────────────

const PREFIX: [string, CondType][] = [
  ["request.query.", "url-param"],
  ["request.form.", "form-field"],
  ["customer.", "auth"],
  ["company.", "company"],
  ["item.", "item"],
];

const pathOf = (c: Cond): string => {
  switch (c.type) {
    case "url-param": return `request.query.${c.key}`;
    case "form-field": return `request.form.${c.key}`;
    case "company": return `company.${c.key}`;
    case "item": return `item.${c.key}`;
    case "auth": return `customer.${c.key.replace(/^customer\./, "")}`;
    default: return c.key;
  }
};

/** A comparison literal: bare for booleans / numbers (and numeric operators), quoted otherwise. */
function lit(value: string, op: Op): string {
  if (op === "greater-than" || op === "less-than") return value;
  if (value === "true" || value === "false" || /^-?\d+(\.\d+)?$/.test(value)) return value;
  return `'${value.split("'").join("\\'")}'`;
}

/** One condition → its Liquid boolean (the converter's `termOf`). */
export function serverTerm(c: Cond): string {
  if (c.type === "auth" && (c.key === "status" || !c.key)) {
    const out = c.value === "logged-out";
    return (c.op === "not-equals" ? !out : out) ? "customer == blank" : "customer";
  }
  const p = pathOf(c);
  switch (c.op) {
    case "exists": return `${p} != blank`;
    case "not-exists": return `${p} == blank`;
    case "equals": return `${p} == ${lit(c.value, c.op)}`;
    case "not-equals": return `${p} != ${lit(c.value, c.op)}`;
    case "greater-than": return `${p} > ${lit(c.value, c.op)}`;
    case "less-than": return `${p} < ${lit(c.value, c.op)}`;
    case "contains": return `${p} contains ${lit(c.value, c.op)}`;
    case "not-contains": return `${p} contains ${lit(c.value, c.op)} == false`;
  }
}

/** The server group → the `{% if %}` markup ("" when empty). */
export function serializeServer(g: Group): string {
  return g.conds.map(serverTerm).join(g.logic === "any" ? " or " : " and ");
}

/** Split on a keyword outside quotes. */
function splitWord(s: string, word: string): string[] {
  const out: string[] = [];
  let q: string | null = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === q && s[i - 1] !== "\\") q = null;
    } else if (ch === "'" || ch === '"') q = ch;
    else if (s.startsWith(` ${word} `, i)) {
      out.push(s.slice(start, i));
      start = i + word.length + 2;
      i += word.length + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim());
}

const unquote = (v: string): string | null => {
  const m = /^(['"])([\s\S]*)\1$/.exec(v);
  if (m) return m[2]!.split("\\'").join("'");
  return /^(-?\d+(\.\d+)?|true|false)$/.test(v) ? v : null;
};

const PATH = /^[A-Za-z_][\w-]*(?:\.[\w-]+)*$/;

function typeOfPath(path: string): { type: CondType; key: string } {
  for (const [p, type] of PREFIX) if (path.startsWith(p)) return { type, key: path.slice(p.length) };
  return { type: "connector", key: path };
}

/** One Liquid boolean → a condition, or null when it isn't one the builder can show. */
export function parseServerTerm(t: string): Cond | null {
  if (t === "customer") return { type: "auth", key: "status", op: "equals", value: "logged-in" };
  if (t === "customer == blank") return { type: "auth", key: "status", op: "equals", value: "logged-out" };
  if (t === "customer != blank") return { type: "auth", key: "status", op: "equals", value: "logged-in" };
  const nc = /^(\S+) contains (.+) == false$/.exec(t);
  if (nc) {
    const v = unquote(nc[2]!.trim());
    if (!PATH.test(nc[1]!) || v == null) return null;
    return { ...typeOfPath(nc[1]!), op: "not-contains", value: v };
  }
  const m = /^(\S+)\s*(==|!=|>|<|contains)\s*(.+)$/.exec(t);
  if (!m) return PATH.test(t) ? { ...typeOfPath(t), op: "exists", value: "" } : null;
  const [, path, sym, rhs] = m as unknown as [string, string, string, string];
  if (!PATH.test(path)) return null;
  const r = rhs.trim();
  const at = typeOfPath(path);
  if (r === "blank" || r === "empty" || r === "nil") {
    if (sym === "==") return { ...at, op: "not-exists", value: "" };
    if (sym === "!=") return { ...at, op: "exists", value: "" };
    return null;
  }
  const v = unquote(r);
  if (v == null) return null;
  const op: Op = sym === "==" ? "equals" : sym === "!=" ? "not-equals" : sym === ">" ? "greater-than" : sym === "<" ? "less-than" : "contains";
  return { ...at, op, value: v };
}

/** `{% if %}` markup → one group, or null when it mixes `and` / `or` or holds a term the builder can't show. */
export function parseServer(markup: string): Group | null {
  const s = markup.trim();
  if (!s) return { logic: "all", conds: [] };
  if (/[()]|\|/.test(s.replace(/'[^']*'|"[^"]*"/g, ""))) return null;
  const ors = splitWord(s, "or");
  const ands = splitWord(s, "and");
  if (ors.length > 1 && ands.length > 1) return null;
  const parts = ors.length > 1 ? ors : ands;
  const conds = parts.map(parseServerTerm);
  if (conds.some((c) => !c)) return null;
  return { logic: ors.length > 1 ? "any" : "all", conds: conds as Cond[] };
}

// ── browser: data-state-show ───────────────────────────────────────────────

const STATE_SYM: Partial<Record<Op, string>> = { equals: "=", "not-equals": "!=", "greater-than": ">", "less-than": "<", contains: "*=" };
const ATOM = /^(!)?((?:local:|url:|ls:)?[^\s=!<>&|*]+?)(?:(!=|\*=|>=|<=|=|>|<)(.*))?$/;

/** One browser condition → a `test()` atom. A form field is the runtime's live `field:<name>` key. */
export function showAtom(c: Cond): string {
  const key = c.type === "localStorage" ? `ls:${c.key.replace(/^ls:/, "")}` : c.type === "form-field" ? `field:${c.key.replace(/^field:/, "")}` : c.key;
  if (c.op === "exists") return key;
  if (c.op === "not-exists") return `!${key}`;
  if (c.op === "not-contains") return `!${key}*=${c.value}`;
  return `${key}${STATE_SYM[c.op] ?? "="}${c.value}`;
}

/** Browser groups → the DNF expression (an `any` group's terms are each their own disjunct). */
export function serializeShow(groups: readonly Group[]): string {
  const disjuncts: string[] = [];
  for (const g of groups) {
    const atoms = g.conds.map(showAtom);
    if (!atoms.length) continue;
    if (g.logic === "any") disjuncts.push(...atoms);
    else disjuncts.push(atoms.join("&&"));
  }
  return disjuncts.join("||");
}

/** One atom → a condition, or null. */
export function parseShowAtom(a: string): Cond | null {
  const m = ATOM.exec(a.trim());
  if (!m) return null;
  const [, not, rawKey, sym, rhs = ""] = m as unknown as [string, string | undefined, string, string | undefined, string | undefined];
  const ls = rawKey.startsWith("ls:");
  const field = rawKey.startsWith("field:");
  const base = ls
    ? { type: "localStorage" as CondType, key: rawKey.slice(3) }
    : field
      ? { type: "form-field" as CondType, key: rawKey.slice(6) }
      : { type: "state" as CondType, key: rawKey };
  if (!sym) return { ...base, op: not ? "not-exists" : "exists", value: "" };
  if (sym === "*=") return { ...base, op: not ? "not-contains" : "contains", value: rhs };
  if (not) return null;
  const op: Op | null = sym === "=" ? "equals" : sym === "!=" ? "not-equals" : sym === ">" ? "greater-than" : sym === "<" ? "less-than" : null;
  return op ? { ...base, op, value: rhs } : null;
}

/** `data-state-show` → groups (one `all` group per `||` disjunct), or null when an atom doesn't parse. */
export function parseShow(expr: string): Group[] | null {
  const s = expr.replace(/&amp;/g, "&").trim();
  if (!s) return [];
  const groups: Group[] = [];
  for (const d of s.split("||")) {
    const conds = d.split("&&").map(parseShowAtom);
    if (conds.some((c) => !c)) return null;
    groups.push({ logic: "all", conds: conds as Cond[] });
  }
  // Every group a single atom: present them as one "any" group (what the converter wrote them from).
  if (groups.length > 1 && groups.every((g) => g.conds.length === 1)) return [{ logic: "any", conds: groups.map((g) => g.conds[0]!) }];
  return groups;
}

// ── device: responsive hide classes ────────────────────────────────────────

export const DEVICE_CLASS = { mobile: "md:hidden", desktop: "max-md:hidden" } as const;
export type Device = keyof typeof DEVICE_CLASS | "all";

export function deviceOf(classes: readonly string[]): Device {
  if (classes.includes(DEVICE_CLASS.mobile)) return "mobile";
  if (classes.includes(DEVICE_CLASS.desktop)) return "desktop";
  return "all";
}
