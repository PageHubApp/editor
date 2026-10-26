/**
 * The core facets and their combine rules:
 * elements (name collision → error; precedence decides match order), commands (id collision
 * → error), keybindings (all kept, highest precedence first; equal precedence + same key +
 * overlapping `when` → error), menus / toolbar / palette (concatenated, sorted by
 * `group@order`), rules (all), storage (exactly one), dataSources (by name), panels (by
 * slot, sorted by order), normalizers (by phase, then precedence), components (host map
 * overrides defaults, `null` hides), parserTags (by name → one parser environment).
 */
import { ConfigError, defineFacet, uniqueBy, type FacetInput, type PrecName } from "./extension";
import { createParserEnvironment, type Environment, type ParserTag } from "../parse/environment";
import { normalizeKey } from "../commands/keys";
import type { ElementDef } from "../elements/defineElement";
import type { Command } from "../commands/defineCommand";
import type { KeyBinding, MenuItem, ToolbarItem, PaletteItem } from "../commands/contributes";

export const elementsFacet = defineFacet<ElementDef<any>, readonly ElementDef<any>[]>({
  id: "elements",
  combine: (values, inputs) => {
    uniqueBy<ElementDef<any>>("element", (e) => e.name)(values, inputs);
    return values;
  },
});

export const commandsFacet = defineFacet<Command<any>, ReadonlyMap<string, Command<any>>>({
  id: "commands",
  combine: uniqueBy<Command<any>>("command", (c) => c.id),
});

export interface ResolvedKeyBinding extends KeyBinding {
  /** Canonical key (`mod+shift+d`), and the mac override canonicalized. */
  canonical: string;
  canonicalMac: string;
  prec: PrecName;
  source: string;
}

const whenOverlaps = (a?: string, b?: string): boolean => !a || !b || a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

export const keybindingsFacet = defineFacet<KeyBinding, readonly ResolvedKeyBinding[]>({
  id: "keybindings",
  combine: (_values, inputs) => {
    const out: ResolvedKeyBinding[] = inputs.map(({ value, source, prec }) => ({
      ...value,
      canonical: normalizeKey(value.key),
      canonicalMac: normalizeKey(value.mac ?? value.key),
      prec,
      source,
    }));
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        if (a.prec === b.prec && (a.canonical === b.canonical || a.canonicalMac === b.canonicalMac) && whenOverlaps(a.when, b.when)) {
          throw new ConfigError(
            `keybinding "${a.key}" is bound twice at the same precedence with overlapping "when": ${a.command} (${a.source}) and ${b.command} (${b.source}); use Prec or a narrower "when"`,
          );
        }
      }
    }
    return out;
  },
});

/** `group@order` → sort key: "navigation" first, then groups alphabetically, then order. */
export function sortByGroup<T extends { group?: string }>(items: readonly T[]): T[] {
  const parse = (g = "") => {
    const [name = "", order = "0"] = g.split("@");
    return { name, order: Number(order) || 0 };
  };
  return items
    .map((item, i) => ({ item, i, g: parse(item.group) }))
    .sort((a, b) => {
      if (a.g.name !== b.g.name) {
        if (a.g.name === "navigation") return -1;
        if (b.g.name === "navigation") return 1;
        return a.g.name < b.g.name ? -1 : 1;
      }
      return a.g.order - b.g.order || a.i - b.i;
    })
    .map((x) => x.item);
}

export const menusFacet = defineFacet<Record<string, MenuItem[]>, Readonly<Record<string, readonly MenuItem[]>>>({
  id: "menus",
  combine: (values) => {
    const all: Record<string, MenuItem[]> = {};
    for (const v of values) for (const [slot, items] of Object.entries(v)) (all[slot] ??= []).push(...items);
    return Object.fromEntries(Object.entries(all).map(([slot, items]) => [slot, sortByGroup(items)]));
  },
});

export const toolbarFacet = defineFacet<ToolbarItem, readonly ToolbarItem[]>({ id: "toolbar", combine: (values) => sortByGroup(values) });
export const paletteFacet = defineFacet<PaletteItem, readonly PaletteItem[]>({ id: "palette", combine: (values) => sortByGroup(values) });

/** Rule definitions; all kept, one merged traversal. */
export const rulesFacet = defineFacet<unknown, readonly unknown[]>({ id: "rules", combine: (values) => values });

/** Storage adapter; exactly one. */
export const storageFacet = defineFacet<unknown, unknown | null>({
  id: "storage",
  combine: (values, inputs) => {
    if (values.length > 1) throw new ConfigError(`only one storage may be configured; got ${inputs.map((i) => i.source).join(" and ")}`);
    return values[0] ?? null;
  },
});

/** What the facet keeps of a data source: its name, and the Liquid global it fills. */
export interface DataSourceEntry {
  name: string;
  liquid: { global: string };
}
export const dataSourcesFacet = defineFacet<DataSourceEntry, ReadonlyMap<string, DataSourceEntry>>({
  id: "dataSources",
  combine: uniqueBy<DataSourceEntry>("data source", (d) => d.name),
});

export interface PanelEntry {
  id: string;
  slot: string;
  order?: number;
  [key: string]: unknown;
}

export const panelsFacet = defineFacet<PanelEntry, Readonly<Record<string, readonly PanelEntry[]>>>({
  id: "panels",
  combine: (values) => {
    const out: Record<string, PanelEntry[]> = {};
    for (const p of values) (out[p.slot] ??= []).push(p);
    for (const list of Object.values(out)) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return out;
  },
});

export interface NormalizerEntry {
  phase: string;
  [key: string]: unknown;
}

export const normalizersFacet = defineFacet<NormalizerEntry, Readonly<Record<string, readonly NormalizerEntry[]>>>({
  id: "normalizers",
  combine: (values) => {
    const out: Record<string, NormalizerEntry[]> = {};
    for (const n of values) (out[n.phase] ??= []).push(n);
    return out;
  },
});

export const componentsFacet = defineFacet<Record<string, unknown>, Readonly<Record<string, unknown>>>({
  id: "components",
  // inputs arrive highest precedence first; apply lowest first so higher ones override
  combine: (values) => Object.assign({}, ...[...values].reverse()),
});

export const parserTagsFacet = defineFacet<ParserTag, Environment>({
  id: "parserTags",
  combine: (values, inputs: readonly FacetInput<ParserTag>[]) => {
    uniqueBy<ParserTag>("parser tag", (t) => t.name)(values, inputs);
    return createParserEnvironment(values);
  },
});
