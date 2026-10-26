/**
 * The Add panel's building blocks: the 48px header row, the slim search field (clear button),
 * the filter chip (an icon or label trigger; once a value is picked, a primary pill with a
 * clear X and, when auto-applied, a dot), and the tab strip (←/→ cycle the tabs).
 * The filter menu is a portalled `ListboxPopover`; it closes on Esc or a press outside it.
 */
import { forwardRef, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../../primitives/icons";
import { ListboxPopover } from "../../primitives/ListboxPopover";
import { tooltip } from "../../primitives/tooltip";
import { capital } from "./useBlocks";

export const PanelHeaderRow = ({ children }: { children: ReactNode }) => (
  <div className="border-base-300 bg-base-100 flex h-12 shrink-0 items-center gap-2 border-b px-3">{children}</div>
);

/** Room to park the scroll below the last item. */
export const PanelScrollSpacer = () => <div className="shrink-0" style={{ minHeight: "70vh" }} />;

export const SearchInput = forwardRef<HTMLInputElement, { value: string; onChange(v: string): void; placeholder: string }>(function SearchInput({ value, onChange, placeholder }, ref) {
  return (
    <div className="relative flex-1">
      <span className="text-base-content/60 pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
        <Icon name="search" className="size-3" />
      </span>
      <input
        ref={ref}
        type="text"
        data-add-search=""
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border-base-300 placeholder:text-base-content/60 flex h-7 w-full rounded-md border bg-transparent pl-7 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none ${value ? "pr-7" : "pr-2"}`}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="text-base-content/60 hover:text-base-content absolute top-1/2 right-1.5 flex size-4 -translate-y-1/2 items-center justify-center rounded" aria-label="Clear" {...tooltip("Clear")}>
          <Icon name="x" className="size-3" />
        </button>
      )}
    </div>
  );
});

interface FilterDropdownProps {
  label: string;
  icon?: IconName;
  /** The picked value (null: none). */
  value: string | null;
  autoApplied?: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  items: readonly { name: string; count: number }[];
  onSelect(name: string): void;
  onClear(): void;
}

export function FilterDropdown(p: FilterDropdownProps) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} className="relative" data-filter={p.label}>
      {p.value ? (
        <div className="flex items-center gap-1">
          <span data-filter-value="" className="bg-primary text-primary-content inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            {p.icon && <Icon name={p.icon} className="size-3" />}
            <span>{capital(p.value)}</span>
            {p.autoApplied && <span data-filter-auto="" className="bg-primary-content/60 size-1 rounded-full" {...tooltip("Auto-applied from your site's style")} />}
          </span>
          <button type="button" data-filter-clear="" onClick={p.onClear} className="hover:bg-base-200 cursor-pointer rounded-full p-0.5 transition-colors" aria-label={`Clear ${p.label}`} {...tooltip(`Clear ${p.label}`)}>
            <span className="text-base-content/60"><Icon name="x" className="size-3" /></span>
          </button>
        </div>
      ) : (
        <button type="button" data-filter-trigger="" onClick={() => p.onOpenChange(!p.open)} className="text-base-content/60 hover:bg-base-200 flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors" aria-label={p.label} aria-expanded={p.open} {...tooltip(p.label)}>
          {p.icon ? <Icon name={p.icon} className="size-3.5" /> : <span>{p.label}</span>}
          <span className={`transition-transform ${p.open ? "rotate-180" : ""}`}><Icon name="chevron-down" className="size-3" /></span>
        </button>
      )}
      <ListboxPopover open={p.open} onOpenChange={p.onOpenChange} anchor={box} placement="bottom-end" maxHeight={320} role="menu" dismiss marker="data-filter-menu" className="min-w-[160px]">
        {p.items.map((item) => (
          <li key={item.name} role="none">
            <button type="button" role="menuitem" data-filter-item={item.name} onClick={() => p.onSelect(item.name)} className={`hover:bg-base-200 flex w-full cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-xs transition-colors ${p.value === item.name ? "text-primary font-medium" : "text-base-content"}`}>
              <span>{capital(item.name)}</span>
              <span className="text-base-content/60">{item.count}</span>
            </button>
          </li>
        ))}
      </ListboxPopover>
    </div>
  );
}

export function TabStrip<T extends string>({ tabs, value, onChange, label, trailing }: { tabs: readonly { id: T; label: string }[]; value: T; onChange(id: T): void; label: string; trailing?: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[n]?.focus();
    onChange(tabs[n]!.id);
  };
  return (
    <div ref={list} role="tablist" aria-label={label} className="border-sidebar-border flex min-w-0 shrink-0 border-b">
      {tabs.map((t, i) => (
        <button key={t.id} type="button" role="tab" data-add-tab={t.id} aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)} className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center px-4 py-2 text-sm font-medium transition-colors ${value === t.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
          {t.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
