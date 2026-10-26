// Presentational part only; state lives in connectors/inspector/Inspector.tsx.
/**
 * The inspector's tab bar and its one continuous scroll. Every tab's sections render in a single
 * stack (70vh spacer at the end); tabs are jump links.
 *
 *   <InspectorTabs tabs={tabs} active="layout" onActiveChange={setTab} />
 *
 * - Click a tab → it becomes active, the stack jumps to it (−7px), its sections open and every
 *   other section closes (`openOnly`, persisted). Scroll tracking is ignored for 400ms after.
 * - Scrolling → the active tab follows the last tab whose top is within 60px of the scroll top.
 * - The indicator slides (0.2s cubic-bezier); the active colour applies after 160ms.
 * - Collapse-all (left): closes every top-level section if any is open, else opens all.
 * - First mount: scrolls to the active tab after 100ms (no accordion change). A new element
 *   reuses the mounted tabs, so switching elements does not re-scroll.
 * - `replace` (search results) takes the place of the stacked panels.
 *
 * The scroll box is held in a ref and the click lock is per instance (not a module global), so
 * two inspectors on one page do not interfere.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { AutoHideScrollbar } from "../../primitives/AutoHideScrollbar";
import { useAccordion } from "../toolbar/AccordionContext";

interface InspectorTabView {
  id: string;
  title: string;
  /** Rendered glyph (sized `size-4` by the caller). */
  icon: ReactNode;
  /** Accordion titles inside the tab (opened by a tab click). */
  sectionTitles: readonly string[];
  content: ReactNode;
}

interface InspectorTabsProps {
  tabs: readonly InspectorTabView[];
  active: string;
  onActiveChange(id: string): void;
  /** Left of the tabs (search button, dark toggle). */
  tools?: ReactNode;
  /** Shown in the scroll instead of the panels. */
  replace?: ReactNode;
}

const SCROLL_LOCK_MS = 400;
const INITIAL_SCROLL_MS = 100;
const TOP_THRESHOLD = 60;

function TabButton({ tab, active, onClick, buttonRef }: { tab: InspectorTabView; active: boolean; onClick(): void; buttonRef(el: HTMLButtonElement | null): void }) {
  const [lit, setLit] = useState(active);
  useEffect(() => {
    if (!active) return setLit(false);
    const t = setTimeout(() => setLit(true), 160);
    return () => clearTimeout(t);
  }, [active]);
  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={tab.title}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      data-inspector-tab={tab.id}
      {...tooltip(tab.title, "top")}
      data-tooltip-offset={10}
      className={`relative flex cursor-pointer items-center justify-center rounded-md p-1.5 text-lg font-medium transition-[color,transform] active:scale-90 ${lit ? "text-base-content" : "text-base-content/50 hover:text-base-content"}`}
    >
      <span className="relative z-10 [&>svg]:size-4">{tab.icon}</span>
    </button>
  );
}

export function InspectorTabs({ tabs, active, onActiveChange, tools, replace }: InspectorTabsProps) {
  const accordion = useAccordion();
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const lockUntil = useRef(0);
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const b = current ? buttons.current.get(current) : undefined;
    setIndicator(b ? { left: b.offsetLeft, width: b.offsetWidth } : null);
  }, [current, tabs.length]);

  const first = useRef({ current });
  first.current.current = current;
  useEffect(() => {
    const t = setTimeout(() => {
      const box = scroller.current;
      const el = first.current.current ? sections.current.get(first.current.current) : undefined;
      if (box && el) box.scrollTop = Math.max(0, el.offsetTop - 7);
    }, INITIAL_SCROLL_MS);
    return () => clearTimeout(t);
  }, []);

  const jump = (tab: InspectorTabView) => {
    lockUntil.current = Date.now() + SCROLL_LOCK_MS;
    onActiveChange(tab.id);
    const box = scroller.current;
    const el = sections.current.get(tab.id);
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - 7);
    if (tab.sectionTitles.length) accordion?.openOnly(tab.sectionTitles);
  };

  const onScroll = () => {
    const box = scroller.current;
    if (!box || Date.now() < lockUntil.current) return;
    let next: string | undefined;
    for (const t of tabs) {
      const el = sections.current.get(t.id);
      if (el && el.offsetTop - box.scrollTop <= TOP_THRESHOLD) next = t.id;
    }
    if (next && next !== current) onActiveChange(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Inspector tabs" className="border-base-300 flex shrink-0 items-center gap-1 border-b px-2 py-1">
        {accordion && (
          <button
            type="button"
            data-collapse-all=""
            onClick={accordion.toggleAll}
            {...tooltip(accordion.anyOpen ? "Collapse all" : "Expand all", "top")}
            aria-label={accordion.anyOpen ? "Collapse all" : "Expand all"}
            className="text-base-content/50 hover:text-base-content flex size-8 cursor-pointer items-center justify-center rounded-md p-0 text-sm transition-[color,transform] active:scale-90"
          >
            <Icon name={accordion.anyOpen ? "chevrons-up" : "chevrons-down"} className="size-4" />
          </button>
        )}
        {tools}
        <div className="min-h-px min-w-0 flex-1" aria-hidden />
        <div className="bg-base-300 h-4 w-px shrink-0 self-center" aria-hidden />
        <div className="relative flex flex-row-reverse items-center gap-0.5">
          {indicator && (
            <div
              aria-hidden
              className="bg-base-content pointer-events-none absolute bottom-0 h-0.5 rounded-full"
              style={{ width: indicator.width, left: 0, transform: `translateX(${indicator.left}px)`, transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
          )}
          {tabs.map((t) => (
            <TabButton key={t.id} tab={t} active={t.id === current} onClick={() => jump(t)} buttonRef={(el) => (el ? buttons.current.set(t.id, el) : buttons.current.delete(t.id))} />
          ))}
        </div>
      </div>
      <AutoHideScrollbar ref={scroller} onScroll={onScroll} className="relative flex min-h-0 flex-1 flex-col" data-inspector-scroll="">
        {replace ?? tabs.map((t) => (
          <div key={t.id} role="tabpanel" aria-label={t.title} data-inspector-panel={t.id} ref={(el) => {
              if (el) sections.current.set(t.id, el);
              else sections.current.delete(t.id);
            }} className="flex flex-col">
            {t.content}
          </div>
        ))}
        <div className="shrink-0" style={{ minHeight: "70vh" }} aria-hidden />
      </AutoHideScrollbar>
    </div>
  );
}
