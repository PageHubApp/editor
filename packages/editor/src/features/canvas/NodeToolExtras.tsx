/**
 * Two extra buttons for the selected element's tool strip, both optional:
 * - `IncludeInAiButton` — "Include in AI chat", only when the host registered an AI command
 *   (`aiChatFacet`); render it just before the Delete button.
 * - `SelectMapButton` — "Select Map" on a pin or route inside a `{% map %}`, at the right /
 *   middle of the element; selects the map (`map.select`).
 */
import type { CSSProperties } from "react";
import { commandsFacet } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { useAiChatCommand } from "../menus/aiChat";
import type { Rect } from "./geometry";
import { useKeepInView } from "./useKeepInView";

const BUTTON = "bg-base-100 text-base-content hover:text-primary flex size-6 items-center justify-center rounded shadow-sm disabled:opacity-40";

export function IncludeInAiButton({ className = BUTTON, iconClassName = "size-3.5" }: { className?: string; iconClassName?: string } = {}) {
  const store = useEditorStore();
  const ai = useAiChatCommand();
  const at = useEditorState((s) => (s.selection.primary?.alive ? s.selection.primary : null));
  if (!ai || !at || !store.state.facet(commandsFacet).has(ai)) return null;
  return (
    <button type="button" data-node-ai="" aria-label="Include in AI chat" {...tooltip("Include in AI chat")} disabled={!store.can(ai, { at })} className={className} onClick={() => store.run(ai, { at })}>
      <Icon name="sparkles" className={iconClassName} />
    </button>
  );
}

const MAP_ICON = ["M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13", "M9 4v13", "M15 7v13"];

export function SelectMapButton({ rect }: { rect: Rect }) {
  const store = useEditorStore();
  const can = useEditorState(() => store.can("map.select"));
  const keep = useKeepInView<HTMLButtonElement>(rect);
  if (!can) return null;
  const style: CSSProperties = { left: rect.right + 4, top: (rect.top + rect.bottom) / 2, transform: "translateY(-50%)" };
  return (
    <button ref={keep} type="button" data-select-map="" aria-label="Select Map" {...tooltip("Select Map", "right")} className={`${BUTTON} pointer-events-auto absolute z-40`} style={style} onClick={() => store.run("map.select")}>
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {MAP_ICON.map((d) => <path key={d} d={d} />)}
      </svg>
    </button>
  );
}
