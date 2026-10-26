/**
 * The icon catalogue: the icon sets the icon picker browses, supplied by the host. A ref is
 * `<set>/<Name>` (`tb/TbPhone`), the same string `{{ 'tb/TbPhone' | icon }}` takes. The editor
 * ships no icon data.
 */
import { defineFacet } from "../extensions/extension";

export interface IconSet {
  id: string;
  name: string;
  count: number;
}

export interface IconCategory {
  key: string;
  label: string;
  /** Full refs (`tb/TbPhone`). */
  refs: readonly string[];
}

export interface IconCatalogue {
  sets(): readonly IconSet[] | Promise<readonly IconSet[]>;
  /** Every icon name in a set (`TbPhone`). */
  names(set: string): readonly string[] | Promise<readonly string[]>;
  /** The inline SVG of a ref, or null when unknown. */
  svg(ref: string): string | null;
  /** Refs of the "Common" section. */
  common?: readonly string[];
  categories?(set: string): readonly IconCategory[];
}

export const iconCatalogueFacet = defineFacet<IconCatalogue, IconCatalogue | null>({ id: "iconCatalogue", combine: (values) => values[0] ?? null });

/** A catalogue over `{ set: { Name: svg } }` — tests and small hosts. */
export function memoryIconCatalogue(data: Readonly<Record<string, Readonly<Record<string, string>>>>, common: readonly string[] = []): IconCatalogue {
  return {
    sets: () => Object.entries(data).map(([id, icons]) => ({ id, name: id, count: Object.keys(icons).length })),
    names: (set) => Object.keys(data[set] ?? {}),
    svg: (ref) => {
      const i = ref.indexOf("/");
      return (i > 0 ? data[ref.slice(0, i)]?.[ref.slice(i + 1)] : undefined) ?? null;
    },
    common,
  };
}
