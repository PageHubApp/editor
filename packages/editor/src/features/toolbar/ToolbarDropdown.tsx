/**
 * Select row: a Headless UI Listbox anchored bottom-start, portalled, z-index 80, list
 * max-h-72; the empty option shows "None"; opening it blurs an active contentEditable.
 *
 *   <ToolbarDropdown value="p-4" onChange={set} valueLabels={["p-2", "p-4"]} />
 *   <ToolbarDropdown value={v} onChange={set}><option value="">None</option>…</ToolbarDropdown>
 */
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Children, isValidElement, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Chip } from "../../primitives/Chip";

/** Stacking of the dropdown list above the sidebar. */
export const Z_TOOLBAR_DROPDOWN = 80;

const EMPTY = "__ph_empty__";
const toInternal = (v: string) => (v === "" ? EMPTY : v);
const fromInternal = (v: string) => (v === EMPTY ? "" : v);

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(textOf).join("") : "";

type OptionItem = { kind: "item"; value: string; label: string } | { kind: "group"; label: string };

function optionsFromChildren(children: ReactNode): OptionItem[] {
  const items: OptionItem[] = [];
  const visit = (child: ReactNode) => {
    if (!isValidElement(child)) return;
    const props = (child as ReactElement<{ label?: string; value?: unknown; children?: ReactNode }>).props;
    if (child.type === "optgroup") {
      if (props.label) items.push({ kind: "group", label: props.label });
      Children.forEach(props.children, visit);
      return;
    }
    const label = textOf(props.children);
    const raw = props.value !== undefined ? String(props.value) : label;
    items.push({ kind: "item", value: toInternal(raw), label: raw === "" ? "None" : label || raw });
  };
  Children.forEach(children, visit);
  return items;
}

export interface ToolbarDropdownProps {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  /** `<option>` / `<optgroup>` children; else `valueLabels`. */
  children?: ReactNode;
  valueLabels?: readonly string[];
  /** Display label for a `valueLabels` entry (e.g. the host's Tailwind label formatter). */
  formatLabel?: (value: string) => string;
  title?: string;
  placeholder?: ReactNode;
  /** `control` = no Chip frame (the parent row provides it). */
  wrap?: string | null;
  append?: ReactNode;
  /** Trigger id: `input-<inputId>` (the row label focuses it). */
  inputId?: string;
  chevron?: boolean;
  tooltipId?: string;
  tooltipContent?: string;
  tooltipPlace?: "top" | "bottom" | "left" | "right";
  tooltipOffset?: number;
  /** Classes of the floating list (host chrome style). */
  contentClassName?: string;
}

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function ToolbarDropdown({
  value,
  onChange,
  children,
  valueLabels = [],
  formatLabel = (v) => v,
  title,
  placeholder,
  wrap = null,
  append,
  inputId,
  chevron = false,
  tooltipId,
  tooltipContent,
  tooltipPlace = "bottom",
  tooltipOffset = 10,
  contentClassName = "ph-select-content",
}: ToolbarDropdownProps) {
  const options = useMemo<OptionItem[]>(
    () => (children ? optionsFromChildren(children) : [{ kind: "item", value: EMPTY, label: " " }, ...valueLabels.map((v) => ({ kind: "item" as const, value: toInternal(v), label: formatLabel(v) }))]),
    [children, valueLabels, formatLabel],
  );
  const internal = toInternal(String(value ?? ""));
  const selectedLabel = internal === EMPTY ? null : options.find((o) => o.kind === "item" && o.value === internal)?.label;

  // Headless UI portals the list to <body>, outside the host's `data-theme` wrapper, so the panel carries the theme itself
  // (the chrome's dark palette and `dark:` utilities key on `[data-theme=dark]`). Read after every render: the host can
  // switch light/dark while the editor stays mounted.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<string | undefined>();
  useLayoutEffect(() => {
    const next = triggerRef.current?.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined;
    setTheme((prev) => (prev === next ? prev : next));
  });

  const trigger = (
    <ListboxButton
      ref={triggerRef}
      id={inputId ? `input-${inputId}` : undefined}
      className="aria-expanded:bg-base-300/15 flex h-full min-w-0 flex-1 items-center px-1 text-left text-xs outline-none focus:outline-none focus-visible:outline-none"
      aria-label={title || (typeof placeholder === "string" ? placeholder : "Select option")}
      onClick={() => {
        const active = document.activeElement as HTMLElement | null;
        if (active?.contentEditable === "true") active.blur();
      }}
      data-tooltip-id={tooltipId}
      data-tooltip-content={tooltipContent}
      data-tooltip-place={tooltipPlace}
      data-tooltip-offset={tooltipOffset}
    >
      <span className="truncate">{selectedLabel ?? placeholder ?? ""}</span>
    </ListboxButton>
  );

  const trailing =
    append || chevron ? (
      <>
        {append && <div className="flex shrink-0 items-center gap-0.5">{append}</div>}
        {chevron && (
          <span className="text-neutral-content flex size-5 shrink-0 items-center justify-center">
            <ChevronDown />
          </span>
        )}
      </>
    ) : null;

  return (
    <Listbox value={internal} onChange={(v: string) => onChange(fromInternal(v))}>
      {title && (
        <div className="mb-2 block">
          <label>{title}</label>
        </div>
      )}
      {wrap === "control" ? (
        <div className="flex w-full items-center gap-1.5">
          {trigger}
          {trailing}
        </div>
      ) : (
        <Chip trailing={trailing}>{trigger}</Chip>
      )}
      <ListboxOptions anchor="bottom start" transition className={contentClassName} modal={false} portal data-theme={theme} style={{ zIndex: Z_TOOLBAR_DROPDOWN }}>
        <div className="scrollbar max-h-72 overflow-y-auto">
          {options.map((opt, i) =>
            opt.kind === "group" ? (
              <div key={`group-${opt.label}-${i}`} className={`ph-select-group text-base-content px-2 pb-1.5 font-bold ${i === 0 ? "pt-1" : "pt-2"}`}>
                {opt.label}
              </div>
            ) : (
              <ListboxOption key={opt.value} value={opt.value} className="ph-select-item">
                {opt.value === EMPTY ? <span className="text-neutral-content">None</span> : opt.label}
              </ListboxOption>
            ),
          )}
        </div>
      </ListboxOptions>
    </Listbox>
  );
}
