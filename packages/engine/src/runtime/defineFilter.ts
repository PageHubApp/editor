/**
 * `defineFilter` — a Liquid filter as an extension value.
 *
 * `args` is one schema per positional argument; a trailing `t.hash({...})` describes the
 * `key: value` options (liquidjs delivers those as `[key, value]` pairs, see `splitArgs`).
 * Arguments are checked before `run`; `nil` counts as absent. `run` receives the raw argument
 * list, exactly as the built-ins do, and must be pure and cheap. `returns: "html"` marks the
 * output trusted (`| raw` allowed, and it is written unescaped when it ends the chain).
 */
import { EXTENSION, type Extension } from "../extensions/extension";
import type { Schema } from "../schema/t";
import { filtersFacet } from "./facets";
import { splitArgs, type BuiltinFilter } from "./filters/types";

export interface FilterDef extends BuiltinFilter {
  readonly runtime: "filter";
  readonly args: readonly Schema<any>[];
  [EXTENSION](): Extension;
}

export function defineFilter(def: BuiltinFilter & { args: readonly Schema<any>[] }): FilterDef {
  if (!/^[a-z_][a-z0-9_]*$/i.test(def.name)) throw new Error(`filter name "${def.name}" is not a valid identifier`);
  if (def.args.slice(0, -1).some((s) => s.type === "hash")) throw new Error(`filter "${def.name}": only the last argument schema may be a hash`);
  const filter: FilterDef = { ...def, runtime: "filter", [EXTENSION]: () => filtersFacet.of(filter) };
  return filter;
}

/** Throws a readable error when `args` do not satisfy the filter's schemas. */
export function checkFilterArgs(def: Pick<FilterDef, "name" | "args">, args: unknown[]): void {
  const hashSchema = def.args.at(-1)?.type === "hash" ? def.args.at(-1)! : undefined;
  const positional = hashSchema ? def.args.slice(0, -1) : def.args;
  const { pos, kv } = splitArgs(args);
  if (pos.length > positional.length) throw new Error(`filter "${def.name}" takes ${positional.length} argument(s), got ${pos.length}`);
  positional.forEach((schema, i) => {
    const r = schema.check(pos[i] ?? undefined);
    if (!r.ok) throw new Error(`filter "${def.name}" argument ${i + 1}: ${r.error}`);
  });
  if (Object.keys(kv).length) {
    if (!hashSchema) throw new Error(`filter "${def.name}" takes no options (got ${Object.keys(kv).join(", ")})`);
  }
  if (hashSchema) {
    const r = hashSchema.check(Object.fromEntries(Object.entries(kv).filter(([, v]) => v != null)));
    if (!r.ok) throw new Error(`filter "${def.name}" option ${r.error}`);
  }
}
