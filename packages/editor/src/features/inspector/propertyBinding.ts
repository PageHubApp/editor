/**
 * Property key → the binding a control writes, from the property map. Controls are
 * addressed by today's prop key (`padding`, `hover.background`) or any alias (`bgColor`); the
 * map supplies the class group and the variant.
 *
 *   classBinding("padding")          // { prop: "padding", group: "p" }
 *   classBinding("hover.background") // { prop: "hover.background", group: "bg-color", state: "hover" }
 *
 * One strict path: an unknown key, or a key whose home is not a Tailwind class, throws (a
 * typo must not render a dead control).
 */
import { PROPERTY_MAP, allNames, type PropEntry } from "../../property-map/propertyMap";

interface ClassBinding {
  /** The entry's canonical key. */
  prop: string;
  group: string;
  /** State variant written with no breakpoint (`hover`). */
  state?: string;
  entry: PropEntry;
}

let index: Map<string, PropEntry> | null = null;

function propEntry(name: string): PropEntry {
  index ??= new Map(PROPERTY_MAP.flatMap((e) => allNames(e).map((n) => [n, e] as const)));
  const e = index.get(name);
  if (!e) throw new Error(`unknown property "${name}" (not in the property map)`);
  return e;
}

const cache = new Map<string, ClassBinding>();

export function classBinding(name: string): ClassBinding {
  const hit = cache.get(name);
  if (hit) return hit;
  const entry = propEntry(name);
  if (entry.home !== "tailwind-class" || !entry.group) throw new Error(`property "${name}" is not a class (home: ${entry.home}); use its own control`);
  const b: ClassBinding = { prop: entry.key, group: entry.group, ...(entry.variant === "hover" ? { state: "hover" } : {}), entry };
  cache.set(name, b);
  return b;
}
