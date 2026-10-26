/**
 * `data-state-class` in and out. Entries join with `;`; each is `test=>classes` (any runtime
 * `test()` expression), the short `atom:classes`, or a `{{ ph_mod_N }}` the converter captured on
 * the server (a row / site gate) — kept as-is.
 *
 *   parseClassEntries("cart:open=>block;{{ ph_mod_2 }}")
 *     // → [{ kind: "test", test: "cart:open", classes: "block" }, { kind: "server", raw: "{{ ph_mod_2 }}" }]
 */
export type ClassEntry = { kind: "test"; test: string; classes: string } | { kind: "server"; raw: string };

const SHORT = /^\s*(!?(?:local:|url:)?[\w.-]+(?:(?:!=|>=|<=|=|>|<)[^:]*)?):(.*)$/;

export function parseClassEntries(value: string): ClassEntry[] {
  const out: ClassEntry[] = [];
  for (const raw of value.replace(/&amp;/g, "&").split(";")) {
    const e = raw.trim();
    if (!e) continue;
    if (e.includes("{{") || e.includes("{%")) {
      out.push({ kind: "server", raw: e });
      continue;
    }
    const arrow = e.indexOf("=>");
    if (arrow >= 0) out.push({ kind: "test", test: e.slice(0, arrow).trim(), classes: e.slice(arrow + 2).trim() });
    else {
      const m = SHORT.exec(e);
      out.push(m ? { kind: "test", test: m[1]!.trim(), classes: m[2]!.trim() } : { kind: "server", raw: e });
    }
  }
  return out;
}

export function serializeClassEntries(entries: readonly ClassEntry[]): string {
  return entries.map((e) => (e.kind === "server" ? e.raw : `${e.test}=>${e.classes}`)).join(";");
}
