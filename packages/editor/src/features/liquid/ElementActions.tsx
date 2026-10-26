/**
 * The element action "Repeat for each…", shown in the inspector's Data source section: the full
 * provider / collection + filter + sort + limit / skip + scope / split panel (`DataSourcePanel`).
 * It owns the `{% for %}` wrapper around the element and its managed `{% assign %}` sibling.
 * ("Show only when…" is the Conditions section's `ConditionsEditor`.)
 */
import type { NodeHandle } from "@pagehub/engine";
import { DataSourcePanel } from "../inspector/DataSourcePanel";

export function RepeatForEach({ handle }: { handle: NodeHandle }) {
  return <DataSourcePanel handle={handle} />;
}
