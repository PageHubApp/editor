/**
 * ToolbarSection — an inspector accordion: a header row and a grid body.
 *
 *   <ToolbarSection title="Size" actions={<BreakpointChip prop="width" ghost />} help="Width and height">
 *     <ToolbarItem prop="width" label="Width" type="text" />
 *   </ToolbarSection>
 *
 * - Only the title text toggles (click, Enter, Space); the actions on the right never do.
 *   `help` shows as a tooltip on the left after 750ms. `onHeaderClick` runs first and can
 *   `preventDefault()` to stop the toggle (popover-only sections open their popover instead).
 * - Inside an `AccordionProvider` the open state is shared and persisted by title; outside one
 *   it is local (`defaultOpen`, default true). `nested` sections are smaller and don't follow
 *   collapse-all.
 * - `overrideDot`: the section's aggregate breakpoint dot (`SectionOverrideDot`).
 * - `disabled`: header dimmed, no body; `onHeaderClick` still runs (an empty section's header opens its "+").
 *
 * The title is not used as the DOM `id` (titles have spaces and can duplicate), and the
 * Enter / Space handler checks `defaultPrevented` before calling `preventDefault()`, so the
 * keyboard can toggle a section.
 */
import { useEffect, useId, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Icon } from "../../primitives/icons";
import { TOOLTIP_ID } from "../../primitives/tooltip";
import { useAccordion } from "./AccordionContext";

export interface ToolbarSectionProps {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  /** Grid columns of the body. */
  columns?: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
  nested?: boolean;
  disabled?: boolean;
  help?: string;
  /** Right side of the header (breakpoint chip, "+" picker, pin). */
  actions?: ReactNode;
  overrideDot?: ReactNode;
  showChevron?: boolean;
  /** Opt out of the shared accordion state. */
  passive?: boolean;
  onHeaderClick?(e: MouseEvent | KeyboardEvent): void;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Fixed body height with its own scroll (e.g. "150px"). */
  scrollHeight?: string;
}

export function ToolbarSection({
  title,
  icon,
  children,
  columns = 1,
  collapsible = true,
  defaultOpen,
  nested = false,
  disabled = false,
  help,
  actions,
  overrideDot,
  showChevron = false,
  passive = false,
  onHeaderClick,
  footer,
  className = "",
  bodyClassName = "",
  scrollHeight,
}: ToolbarSectionProps) {
  const accordion = useAccordion();
  const managed = !!accordion && collapsible && !passive;
  const [localOpen, setLocalOpen] = useState(defaultOpen ?? true);
  const labelId = useId();

  const register = accordion?.register;
  const unregister = accordion?.unregister;
  useEffect(() => {
    if (!managed || !register || !unregister) return;
    register(title, defaultOpen, !nested);
    return () => unregister(title);
  }, [managed, register, unregister, title, defaultOpen, nested]);

  const open = !disabled && (managed ? accordion.isOpen(title, defaultOpen) : localOpen);

  const activate = (e: MouseEvent | KeyboardEvent) => {
    onHeaderClick?.(e);
    if (disabled) return;
    if (e.defaultPrevented || !collapsible) return;
    if (managed) accordion.toggle(title, defaultOpen);
    else setLocalOpen((o) => !o);
  };

  const header = nested
    ? `group/bp-row flex w-full items-center gap-1 -mx-3 px-3 py-1.5 text-[11px] font-semibold text-base-content/60 transition-colors ${disabled ? "" : "hover:text-base-content"} ${className}`
    : `group group/bp-row flex w-full items-center gap-2 border-b ${open ? "border-transparent" : "border-base-300/60"} bg-base-100 px-3 py-3 text-xs font-semibold text-base-content transition-colors ${className}`;
  const body = nested
    ? `grid items-end gap-2 ${scrollHeight ? "" : "-mx-3 px-3 pb-2"} ${bodyClassName}`
    : `grid items-end gap-3 border-b border-base-300/60 bg-base-100 text-base-content ${scrollHeight ? "" : "p-3 pt-2"} ${bodyClassName}`;
  const grid = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };

  return (
    <div className="w-full" data-section={title}>
      <div className={header}>
        <div
          id={labelId}
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={`flex min-w-0 flex-1 items-center gap-1.5 ${disabled ? "opacity-40" : ""} ${collapsible && !disabled ? "cursor-pointer" : ""}`}
          onClick={activate}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            // toggle first: activate reads defaultPrevented as "a consumer took over"
            activate(e);
            e.preventDefault();
          }}
          aria-expanded={disabled ? undefined : open}
          {...(help ? { "data-tooltip-id": TOOLTIP_ID, "data-tooltip-content": help, "data-tooltip-place": "left", "data-tooltip-delay-show": 750, "data-tooltip-offset": 10 } : {})}
        >
          {nested && collapsible && <Icon name="chevron-right" className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />}
          {icon && <span className="text-base-content/60 opacity-70">{icon}</span>}
          {title}
          {overrideDot}
          {showChevron && collapsible && <Icon name="chevron-right" className={`text-base-content/60 ml-auto size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />}
        </div>
        {actions && <div className="flex max-w-[min(100%,20rem)] min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1">{actions}</div>}
      </div>
      {open &&
        (scrollHeight ? (
          <div className={body} style={{ maxHeight: scrollHeight, height: scrollHeight }}>
            <div className="scrollbar h-full overflow-y-auto">
              <div className={nested ? "p-2" : "p-3"} style={{ ...grid, display: "grid", gap: nested ? "0.5rem" : "0.75rem", alignItems: "end" }} role="group" aria-labelledby={labelId}>
                {children}
              </div>
              {footer && <div className={nested ? "p-2" : "p-3"}>{footer}</div>}
            </div>
          </div>
        ) : (
          <div className={body} style={grid} role="group" aria-labelledby={labelId}>
            {children}
            {footer}
          </div>
        ))}
    </div>
  );
}
