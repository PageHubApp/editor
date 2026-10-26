/**
 * ActionsEditor — the Action section body once an action is set. Reads the element's attributes
 * back into the action type(s) it encodes (`detectActiveActions`) and renders each one's real
 * sub-form (`ActionDetail` — the same fields the "+" picker shows on add), so coming back to an
 * action re-opens its editable fields instead of a structure note. The X on a card clears every
 * attribute that defines that action. New / different actions are added from the "+" picker in
 * the section header (`ActionPicker`).
 *
 *   <ActionsEditor handle={handle} />
 */
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { ACTION_SPECS, detectActiveActions } from "./actionSpecs";
import { Icon } from "../../primitives/icons";
import { ActionDetail, clearAction } from "./actionFields";
import { useMainCanvasDoc, useOverlayPreview, CLOSE_ON_CANVAS, OPEN_ON_CANVAS } from "../canvas/overlayPreview";
import { gateReader, readActionGate, setActionGate } from "./actionGate";

export function ActionsEditor({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const store = useEditorStore();
  // Re-read whenever the element's attributes change; detection keys off them.
  const active = useEditorState((s) => {
    if (!handle.alive || handle.kind !== "element") return [] as string[];
    void s.files.get(handle.path);
    // Gate-aware: an action behind "only fire when…" keeps its card.
    return detectActiveActions(gateReader(store, handle)).map((t) => (readActionGate(store, handle, t) ? `${t}:gated` : t));
  }, (a, b) => a.join("|") === b.join("|"));

  // Cards whose action shows or hides something (popover / dialog commands, state actions, the cart drawer): preview it on the canvas (view-only).
  const overlay = useOverlayPreview(useMainCanvasDoc(), handle.alive ? handle : null);
  const overlayLabel = overlay.open ? CLOSE_ON_CANVAS : OPEN_ON_CANVAS;

  if (active.length === 0)
    return (
      <div className="text-base-content/60 flex items-center gap-2 px-1 py-2 text-[11px]">
        <Icon name="click" className="size-3.5" />
        Pick what a click does with + above.
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      {active.map((entry) => {
        const [type = "", flag] = entry.split(":");
        const spec = ACTION_SPECS[type];
        if (!spec) return null;
        const gated = flag === "gated";
        return (
          <div key={type} className="border-base-300/70 grid gap-2 rounded-lg border p-2" data-action-card={type}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base-content text-xs font-medium">{spec.label}</span>
              <button
                type="button"
                onClick={() => {
                  if (gated) setActionGate(store, handle, type, null);
                  clearAction(run, handle, type);
                }}
                className="text-base-content/50 hover:bg-error/10 hover:text-error flex size-5 items-center justify-center rounded transition-colors"
                aria-label={`Remove ${spec.label}`}
              >
                <Icon name="x" className="size-3.5" />
              </button>
            </div>
            {gated ? (
              <p className="text-base-content/50 px-1 text-[10px]" data-action-gated="">Fires only when its condition below holds. Remove the condition to edit its options.</p>
            ) : spec.fields.length > 0 ? (
              <ActionDetail handle={handle} fields={spec.fields} />
            ) : (
              <p className="text-base-content/50 px-1 text-[10px]">No options — fires on click.</p>
            )}
            {spec.preview && overlay.src && !gated && (
              <button type="button" data-action-overlay={overlay.open ? "open" : "closed"} aria-pressed={overlay.open} onClick={overlay.toggle} className="border-base-300 text-base-content hover:bg-base-200 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors">
                <Icon name="layout-sidebar-right" className="size-3.5" />
                {overlayLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
