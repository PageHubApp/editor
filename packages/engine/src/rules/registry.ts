/** Read the registered tag and filter names off a liquidjs engine (`createEngine()`), for `RunOptions.registry`. */
import type { Liquid } from "liquidjs";
import { REMOVED_TAGS } from "../liquid/engine";
import type { RuleRegistry } from "./defineRule";

export function registryOfEngine(engine: Liquid): RuleRegistry {
  return {
    tags: new Set(Object.keys(engine.tags)),
    filters: new Set(Object.keys(engine.filters)),
    removedTags: new Set(REMOVED_TAGS),
  };
}
