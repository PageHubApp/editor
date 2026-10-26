/**
 * The variable catalogue: what an author may insert as `{{ output }}` — derived from the
 * editor's sample data and the Liquid in the open files, grouped Company / System / Custom /
 * Other (as an Insert variable popover shows them), plus any groups a host adds through
 * `variableGroupsFacet`. The rich-text Insert variable popover and the `{{` suggestion list
 * read it; every expression is `isSafeExpression`-clean, so inserting one is always valid.
 */
import { defineFacet } from "../extensions/extension";
import { isSafeExpression } from "../schema/t";
import type { EditorState } from "../state/state";
import type { JsonValue } from "../runtime/tags/schema";

export interface VariableItem {
  /** What goes inside `{{ … }}`. */
  expression: string;
  label: string;
  /** The value in the canvas sample data, when there is one. */
  sample?: string;
}

export interface VariableGroup {
  name: string;
  items: VariableItem[];
}

export interface VariableSource {
  state: EditorState;
  data: Record<string, JsonValue>;
}

/** A host's extra groups (a CRM's fields, the site's settings, …). */
export type VariableGroupProvider = (source: VariableSource) => readonly VariableGroup[];

export const variableGroupsFacet = defineFacet<VariableGroupProvider, readonly VariableGroupProvider[]>({ id: "variableGroups", combine: (values) => values });

export const SYSTEM_VARIABLES: readonly VariableItem[] = [
  { expression: "'now' | date: '%Y'", label: "Current year" },
  { expression: "'now' | date: '%B %-d, %Y'", label: "Today's date" },
];

const MAX_DEPTH = 3;
const titleCase = (key: string) => key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Scalar leaves of `value` as `{ expression, sample }` (arrays are loops, not outputs). */
function leaves(value: JsonValue, path: string, depth = 0): VariableItem[] {
  if (value === null || Array.isArray(value)) return [];
  if (typeof value !== "object") return [{ expression: path, label: titleCase(path.split(".").at(-1)!), sample: String(value) }];
  if (depth >= MAX_DEPTH) return [];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`, depth + 1));
}

const ASSIGN = /\{%-?\s*(?:assign|capture)\s+([A-Za-z_][\w-]*)/g;
const SCHEMA = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/g;

function customNames(files: ReadonlyMap<string, string>): string[] {
  const names = new Set<string>();
  for (const text of files.values()) for (const m of text.matchAll(ASSIGN)) names.add(m[1]!);
  return [...names].sort();
}

function sectionSettings(files: ReadonlyMap<string, string>): VariableItem[] {
  const out: VariableItem[] = [];
  for (const text of files.values())
    for (const m of text.matchAll(SCHEMA)) {
      try {
        const settings = (JSON.parse(m[1]!) as { settings?: Array<{ id?: unknown; label?: unknown }> }).settings ?? [];
        for (const s of settings) if (typeof s.id === "string") out.push({ expression: `section.settings.${s.id}`, label: typeof s.label === "string" ? s.label : titleCase(s.id) });
      } catch {
        // an unparseable schema is a lint error elsewhere
      }
    }
  return out;
}

/** The groups, empty ones left out. Order: Company, System, Section, Custom, Other, then the host's. */
export function variableCatalogue({ state, data }: VariableSource): VariableGroup[] {
  const { company, ...rest } = data;
  const groups: VariableGroup[] = [
    { name: "Company", items: company === undefined ? [] : leaves(company, "company") },
    { name: "System", items: [...SYSTEM_VARIABLES] },
    { name: "Section", items: sectionSettings(state.files) },
    { name: "Custom", items: customNames(state.files).map((name) => ({ expression: name, label: titleCase(name) })) },
    { name: "Other", items: Object.entries(rest).flatMap(([k, v]) => leaves(v, k)) },
    ...state.facet(variableGroupsFacet).flatMap((provider) => provider({ state, data })),
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => isSafeExpression(i.expression)) })).filter((g) => g.items.length);
}

/** Items whose label or expression contains `query` (case-insensitive), groups kept. */
export function filterVariables(groups: readonly VariableGroup[], query: string): VariableGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...groups];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.expression.toLowerCase().includes(q)) })).filter((g) => g.items.length);
}
