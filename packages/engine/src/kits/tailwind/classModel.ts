/**
 * The class model behind every style control, after today's
 * `propSystem.ts`: a value lives in the `class` attribute as a token per scope —
 * breakpoint (`sm:` … `2xl:`, none = mobile / base), `dark:` and a state (`hover:`), chained
 * `md:dark:hover:`. Writes replace the group's token in exactly the scopes asked for (twMerge's
 * effect within a group) and leave every other token and its position alone. Reads follow the
 * editor's view fallbacks (`getPropFinalValue`).
 */
import { groupTest, splitClass, type ClassGroup } from "../../elements/bindings";
import { TAILWIND_GROUPS } from "./groups";
import type { NodeHandle } from "../../state/handles";

export const BREAKPOINTS = ["sm", "md", "lg", "xl", "2xl"] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];
/** Canvas views: `mobile` is the base layer, `desktop` the full-width canvas (reads scan every layer). */
export type View = "mobile" | "desktop" | Breakpoint;

export interface Scope {
  /** None = base (mobile). */
  breakpoint?: Breakpoint;
  dark?: boolean;
  /** `hover`, `focus`, … */
  state?: string;
}

export function scopePrefix(s: Scope = {}): string {
  return [s.breakpoint, s.dark && "dark", s.state].filter(Boolean).map((p) => `${p}:`).join("");
}

const split = splitClass;
const test = groupTest;

/** The group's token (without prefix) at exactly this prefix, or null. */
export function tokenAt(classes: readonly string[], group: ClassGroup, prefix: string): string | null {
  const m = test(group);
  const hit = classes.filter((c) => {
    const [p, base] = split(c);
    return p === prefix && m(base);
  }).at(-1);
  return hit === undefined ? null : split(hit)[1];
}

const BUILTIN_GROUPS: ReadonlyMap<string, ClassGroup> = new Map(TAILWIND_GROUPS.map((g) => [g.id, g]));

/**
 * New class list with the group's token set (or removed, `token: null`) in each scope. Setting a
 * token also removes the tokens of `group.conflicts` in that scope (twMerge: `p-4` drops `px-*`);
 * removing never touches other groups. `groups` resolves conflict ids (default: the built-ins).
 */
export function setClasses(classes: readonly string[], group: ClassGroup, token: string | null, scopes: readonly Scope[] = [{}], groups: ReadonlyMap<string, ClassGroup> = BUILTIN_GROUPS): string[] {
  const m = test(group);
  const displaced = token === null ? [] : (group.conflicts ?? []).flatMap((id) => (groups.get(id) ? [test(groups.get(id)!)] : []));
  let out = [...classes];
  for (const scope of scopes) {
    const prefix = scopePrefix(scope);
    const next = token === null ? null : prefix + token;
    const list: string[] = [];
    let placed = next === null;
    for (const c of out) {
      const [p, base] = split(c);
      if (p === prefix && displaced.some((d) => d(base))) continue;
      if (p !== prefix || !m(base)) list.push(c);
      else if (!placed) list.push(next!), (placed = true);
    }
    if (!placed) list.push(next!);
    out = list;
  }
  return out;
}

const DESKTOP_READ_ORDER: readonly (Breakpoint | "mobile")[] = ["mobile", "md", "sm", "lg", "xl", "2xl"];
const bpScope = (v: Breakpoint | "mobile", dark: boolean, state?: string): Scope => ({ breakpoint: v === "mobile" ? undefined : v, dark, state });

/** The value a control shows for `view` and the layer it came from (`getPropFinalValue`). */
export function readClass(classes: readonly string[], group: ClassGroup, opts: { view?: View; dark?: boolean; state?: string } = {}): { value: string | null; view: View } {
  const { view = "mobile", dark = false, state } = opts;
  const at = (v: Breakpoint | "mobile", d: boolean) => tokenAt(classes, group, scopePrefix(bpScope(v, d, state)));
  const withDark = (v: Breakpoint | "mobile") => (dark ? (at(v, true) ?? at(v, false)) : at(v, false));
  if (view === "desktop") {
    for (const v of DESKTOP_READ_ORDER) {
      const value = withDark(v);
      if (value !== null) return { value, view: v };
    }
    return { value: null, view: "mobile" };
  }
  const value = withDark(view);
  if (value !== null) return { value, view };
  const fallback = view === "mobile" ? "md" : "mobile";
  return { value: withDark(fallback), view: fallback };
}

/** Every non-base scope holding a token of the group — the inspector's override dots. */
export function classOverrides(h: NodeHandle | readonly string[], group: ClassGroup): Array<{ prefix: string; token: string }> {
  const classes = Array.isArray(h) ? (h as readonly string[]) : (h as NodeHandle).classes();
  const m = test(group);
  return classes.flatMap((c) => {
    const [prefix, base] = split(c);
    return prefix && m(base) ? [{ prefix, token: base }] : [];
  });
}
