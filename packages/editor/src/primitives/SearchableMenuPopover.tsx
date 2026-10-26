/**
 * SearchableMenuPopover — trigger button → anchored popover with a search field and a list
 * (the inspector's "+" picker, add-attribute menus). AnchoredPopover owns position and dismiss;
 * a Headless UI Combobox owns the input, filtering and keyboard navigation.
 *
 *   <SearchableMenuPopover trigger={<Icon name="plus" />} items={items} onSelect={(i) => add(i.id)} />
 *   <SearchableMenuPopover multiSelect trigger="+" items={items} onSelectMany={(xs) => addAll(xs)} />
 *
 * - Search is focused on open; filters label, id and keywords (or `filterFn`).
 * - Single mode: picking an item closes the menu. Multi mode: a checkbox column and an
 *   "Add (N)" button that applies the picks in click order.
 * - Empty list → `emptyMessage`; nothing matches → `noResultsMessage(query)`.
 * - Closing by an outside click keeps the query and picks.
 */
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { AnchoredPopover } from "./AnchoredPopover";
import { OVERLAY_ROOT_CLASS } from "./portal";
import { Icon } from "./icons";
import { tooltip } from "./tooltip";

export interface SearchableMenuItem<T = unknown> {
  id: string;
  label: string;
  /** Right-aligned secondary text. */
  hint?: string;
  /** Tooltip. */
  help?: string;
  keywords?: string[];
  data?: T;
}

export interface SearchableMenuPopoverHandle {
  open(): void;
  close(): void;
}

interface SearchableMenuPopoverProps<T> {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  onTriggerClick?(): void;
  items: SearchableMenuItem<T>[];
  onSelect?(item: SearchableMenuItem<T>): void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  noResultsMessage?(query: string): string;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  panelWidthClass?: string;
  filterFn?(item: SearchableMenuItem<T>, query: string): boolean;
  renderItem?(item: SearchableMenuItem<T>): ReactNode;
  multiSelect?: boolean;
  onSelectMany?(items: SearchableMenuItem<T>[]): void;
  applyLabel?(count: number): string;
}

const TRIGGER =
  "text-base-content/60 hover:text-base-content hover:bg-base-200 flex size-4 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100 transition-[color,background-color,opacity]";
const ITEM = "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors text-base-content";

function matchesQuery(item: SearchableMenuItem<unknown>, query: string): boolean {
  const q = query.toLowerCase();
  return !q || item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q) || !!item.keywords?.some((k) => k.toLowerCase().includes(q));
}

function defaultRender(item: SearchableMenuItem<unknown>): ReactNode {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.hint && <span className="text-base-content/60 shrink-0 text-[10px]">{item.hint}</span>}
    </>
  );
}

function Inner<T>(
  {
    trigger,
    triggerClassName = TRIGGER,
    triggerAriaLabel,
    onTriggerClick,
    items,
    onSelect,
    searchPlaceholder = "Type to search...",
    emptyMessage = "Nothing to add",
    noResultsMessage = (q) => `No matches for "${q}"`,
    placement = "bottom-end",
    panelWidthClass = "w-64",
    filterFn = matchesQuery,
    renderItem = defaultRender,
    multiSelect = false,
    onSelectMany,
    applyLabel = (n) => `Add${n ? ` (${n})` : ""}`,
  }: SearchableMenuPopoverProps<T>,
  ref: Ref<SearchableMenuPopoverHandle>,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SearchableMenuItem<T>[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);

  const close = () => {
    setOpen(false);
    setQuery("");
    setPicked([]);
  };
  const filtered = useMemo(() => items.filter((i) => filterFn(i, query)), [items, query, filterFn]);
  const pick = (item: SearchableMenuItem<T> | null) => {
    if (!item) return;
    if (!multiSelect) return void (onSelect?.(item), close());
    setPicked((prev) => (prev.some((p) => p.id === item.id) ? prev.filter((p) => p.id !== item.id) : [...prev, item]));
  };

  return (
    <>
      <button ref={buttonRef} type="button" className={triggerClassName} aria-label={triggerAriaLabel} aria-expanded={open} onClick={() => (onTriggerClick?.(), setOpen((o) => !o))}>
        {trigger}
      </button>
      <AnchoredPopover open={open} onOpenChange={setOpen} anchor={buttonRef} placement={placement} ignoreOutsideClicks={[buttonRef]} className={`${OVERLAY_ROOT_CLASS} border-base-300 bg-base-100 ${panelWidthClass} overflow-hidden rounded-xl border p-1 shadow-xl`}>
        <Combobox<SearchableMenuItem<T> | null> value={null} onChange={pick}>
          <div className="border-base-300/60 mb-1 flex items-center gap-1.5 border-b px-2 py-1.5">
            <Icon name="search" className="text-base-content/60 size-3.5 shrink-0" />
            <ComboboxInput
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              displayValue={() => query}
              className="text-base-content placeholder:text-base-content/50 min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </div>
          <ComboboxOptions static as="div" className="scrollbar max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-base-content/60 px-3 py-4 text-center text-xs italic">{items.length === 0 ? emptyMessage : noResultsMessage(query)}</div>
            ) : (
              filtered.map((item) => {
                const on = multiSelect && picked.some((p) => p.id === item.id);
                return (
                  <ComboboxOption key={item.id} value={item} {...tooltip(item.help, "right")} className={({ focus }) => `${ITEM} ${focus ? "bg-base-200" : ""}`}>
                    {multiSelect && (
                      <span aria-hidden className={`flex size-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${on ? "bg-primary border-primary text-primary-content" : "border-base-300 bg-base-100"}`}>
                        {on && <Icon name="check" className="size-2.5" />}
                      </span>
                    )}
                    {renderItem(item)}
                  </ComboboxOption>
                );
              })
            )}
          </ComboboxOptions>
          {multiSelect && (
            <div className="border-base-300/60 mt-1 flex items-center justify-between gap-2 border-t px-2 py-1.5">
              <span className="text-base-content/60 text-[10px]">{picked.length ? `${picked.length} selected` : "Pick one or more"}</span>
              <button
                type="button"
                onClick={() => (picked.length && onSelectMany?.(picked), close())}
                disabled={picked.length === 0}
                className="bg-primary text-primary-content rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {applyLabel(picked.length)}
              </button>
            </div>
          )}
        </Combobox>
      </AnchoredPopover>
    </>
  );
}

export const SearchableMenuPopover = forwardRef(Inner) as <T>(props: SearchableMenuPopoverProps<T> & { ref?: Ref<SearchableMenuPopoverHandle> }) => ReturnType<typeof Inner>;
