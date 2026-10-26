/**
 * Names offered while typing a Liquid expression (manifest autocomplete): loop variables of
 * the enclosing `{% for %}` blocks (and `forloop`), the canvas sample data's top-level keys,
 * the renderer's built-in objects and the registered data sources' globals.
 */
import { dataSourcesFacet, type Configuration, type NodeHandle } from "@pagehub/engine";
import { BUILTIN_OBJECTS } from "@pagehub/engine/render";

/** The Liquid globals the configured data sources fill (`products`, `customer`, …). */
export const dataSourceGlobals = (config: Configuration): string[] => [...config.facet(dataSourcesFacet).values()].map((d) => d.liquid.global);

/** Loop variables of the `{% for %}` blocks around `h`, innermost first. */
export function loopVariables(h: NodeHandle): string[] {
  const out: string[] = [];
  for (let p = h.parent(); p; p = p.parent()) {
    if (p.kind !== "liquid-block" || p.tag !== "for") continue;
    const m = /^\{%-?\s*for\s+([a-z_][\w]*)\s+in\b/i.exec(p.text());
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

/** Loop variables, the sample data's keys, the renderer's built-in objects and the registered data-source globals. */
export function expressionCompletions(h: NodeHandle | null, data: Record<string, unknown> = {}, globals: readonly string[] = []): string[] {
  const loops = h ? loopVariables(h) : [];
  const names = [...loops, ...(loops.length ? ["forloop"] : []), ...Object.keys(data), ...BUILTIN_OBJECTS, ...globals];
  return [...new Set(names)];
}
