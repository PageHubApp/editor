/**
 * The full editors of the Action, Handlers, Conditions and Data source sections, rendered inline
 * as those sections' bodies (`SectionEditor`), and the right-drawer body (`InspectorDetailView`)
 * that still hosts a text leaf's raw-HTML editor (`chromeOf(state).detail`, kind "html").
 *
 *   <SectionEditor kind="conditions" handle={h} />
 *   <InspectorDetailView kind="html" onClose={close} />
 */
import type { NodeHandle } from "@pagehub/engine";
import type { DetailKind } from "../../shell/chromeState";
import { useInspectedHandle } from "../../react/bindings";
import { RepeatForEach } from "../liquid/ElementActions";
import { CodeEditor } from "../liquid/CodeEditor";
import { ActionsEditor } from "./ActionsEditor";
import { ActionConditionsEditor } from "./ActionConditionsEditor";
import { ConditionsEditor } from "./conditions/ConditionsEditor";
import { HandlersEditor } from "./HandlersEditor";
import { ActionPicker } from "./ActionPicker";
import { HandlerPicker } from "./HandlerPicker";

export type SectionEditorKind = "conditions" | "dataSource" | "action" | "handlers";

/** A section's whole editor, for the inline section body. */
export function SectionEditor({ kind, handle }: { kind: SectionEditorKind; handle: NodeHandle }) {
  return (
    <div className="flex min-w-0 flex-col gap-2" data-inspector-detail={kind}>
      {kind === "conditions" && <ConditionsEditor handle={handle} />}
      {kind === "dataSource" && <RepeatForEach handle={handle} />}
      {kind === "action" && (
        <>
          {/* The "+" that adds a new action (its own searchable picker), then the re-edit list. */}
          <div className="flex items-center justify-between">
            <span className="text-base-content/70 text-[11px] font-semibold">Actions</span>
            <ActionPicker handle={handle} />
          </div>
          <ActionsEditor handle={handle} />
          <ActionConditionsEditor handle={handle} />
        </>
      )}
      {kind === "handlers" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-base-content/70 text-[11px] font-semibold">Event handlers</span>
            <HandlerPicker handle={handle} />
          </div>
          <HandlersEditor handle={handle} />
        </>
      )}
    </div>
  );
}

export function InspectorDetailView({ kind }: { kind: DetailKind; onClose(): void }) {
  const handle = useInspectedHandle();
  if (!handle?.alive || handle.kind !== "element") {
    return <p data-slot="InspectorDetail" className="text-base-content/60 p-3 text-xs">Select an element to edit this.</p>;
  }
  return (
    <div data-slot="InspectorDetail" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" data-inspector-detail={kind}>
      {kind === "html" ? <CodeEditor handle={handle} /> : <SectionEditor kind={kind} handle={handle} />}
    </div>
  );
}
