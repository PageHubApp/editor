/**
 * The default `EmptyState` slot: what the sidebar shows with nothing selected — Add Blocks
 * (`insert.open` blocks), Add Components (`insert.open` components), Reusable components, the
 * host's AI card, and "close sidebar" (`sidebar.close`).
 */
import { EmptyInspector } from "../inspector/InspectorStates";

export function EmptyState() {
  return (
    <div data-slot="EmptyState" className="flex min-h-0 flex-1 flex-col">
      <EmptyInspector />
    </div>
  );
}
