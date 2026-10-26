/**
 * The property map: every property the inspector reads or writes, and its
 * home in HTML + Liquid (nothing is retired; a key with no workable form is
 * `escalate`). Pure data, no React.
 */
import { advancedEntries } from "../features/inspector/rows/entries/advanced";
import { componentEntries } from "../features/inspector/rows/entries/components";
import { designEntries } from "../features/inspector/rows/entries/design";
import { interactionEntries } from "../features/inspector/rows/entries/interactions";
import { layoutEntries } from "../features/inspector/rows/entries/layout";
import type { Home, PropEntry, Tab } from "../features/inspector/rows/types";

export type { Home, NewRuntimeAttr, PropEntry, Tab } from "../features/inspector/rows/types";
export { NEW_RUNTIME } from "../features/inspector/rows/runtime";
export { SECTIONS } from "../features/inspector/rows/build";

export const PROPERTY_MAP: readonly PropEntry[] = [
  ...componentEntries,
  ...layoutEntries,
  ...designEntries,
  ...interactionEntries,
  ...advancedEntries,
];

export const HOMES: readonly Home[] = ["tailwind-class", "html-attribute", "liquid-arg", "native", "site-runtime", "schema-setting", "escalate"];
export const TABS: readonly Tab[] = ["component", "layout", "design", "interactions", "advanced", "site", "ui"];

/** Every name a key can be looked up by (key + aliases). */
export function allNames(e: PropEntry): string[] {
  return [e.key, ...(e.aliases ?? [])];
}

export function lookup(name: string): PropEntry | undefined {
  return PROPERTY_MAP.find((e) => allNames(e).includes(name));
}

export function countByHome(entries: readonly PropEntry[] = PROPERTY_MAP): Record<Home, number> {
  const out = Object.fromEntries(HOMES.map((h) => [h, 0])) as Record<Home, number>;
  for (const e of entries) out[e.home]++;
  return out;
}

export const escalated = (): PropEntry[] => PROPERTY_MAP.filter((e) => e.home === "escalate");

/** Tailwind groups the map uses that `TAILWIND_GROUPS` does not ship yet. */
export function newTailwindGroups(): Array<{ group: string; keys: string[] }> {
  const by = new Map<string, string[]>();
  for (const e of PROPERTY_MAP) if (e.newGroup && e.group) by.set(e.group, [...(by.get(e.group) ?? []), e.key]);
  return [...by].map(([group, keys]) => ({ group, keys })).sort((a, b) => a.group.localeCompare(b.group));
}
