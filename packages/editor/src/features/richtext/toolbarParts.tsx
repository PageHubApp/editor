/** Shared pieces of the inline text toolbar and its panels: the `.tool-bg` / `.tool-button` looks. */
import type { MouseEvent } from "react";
import { tooltip } from "../../primitives/tooltip";
import { Icon, type IconName } from "../../primitives/icons";

export const TOOL_BG = "rounded-box border-base-300/50 bg-base-100 text-base-content flex items-center justify-center gap-2 border p-1 text-sm leading-normal font-normal shadow-xl";
export const TOOL_BUTTON =
  "text-base-content hover:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 bg-transparent p-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus:outline-none active:scale-90 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px]";

/** Keep the focus (and the text selection) in the edited text. */
export const keepFocus = (e: MouseEvent) => e.preventDefault();

export function ToolButton({ icon, label, active, tint, onClick }: { icon: IconName; label: string; active?: boolean; tint?: boolean; onClick(): void }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} className={`${TOOL_BUTTON} ${tint ? "bg-primary/15 text-primary" : active ? "bg-base-200 text-base-content" : ""}`} onMouseDown={keepFocus} onClick={onClick} {...tooltip(label, "top")} data-tooltip-offset={10}>
      <Icon name={icon} />
    </button>
  );
}

