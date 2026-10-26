/**
 * The Pinned dock under the inspector scroll: one block per pinned section (title + Unpin, the
 * section's rows below). Hidden with no pins. Collapses to a "Pinned" bar and resizes from its
 * top edge like the Layers panel: 120px to 60% of the window, default 250; both persisted
 * (`sidebar-inspector-pin-height`, `sidebar-inspector-pin-dock`).
 *
 *   <PinnedDock sections={[{ id: "size", title: "Size", body: <rows/> }]} onUnpin={togglePin} />
 */
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "../../primitives/icons";
import { readJSON, writeJSON } from "../../primitives/storage";
import { tooltip } from "../../primitives/tooltip";
import { useDragGesture } from "../../primitives/useDragGesture";
import { AutoHideScrollbar } from "../../primitives/AutoHideScrollbar";
import { InspectorIcon } from "./inspectorIcons";

const PIN_DOCK_MIN = 120;
const PIN_DOCK_DEFAULT = 250;
const PIN_DOCK_MAX_RATIO = 0.6;
const HEIGHT_KEY = "sidebar-inspector-pin-height";
const OPEN_KEY = "sidebar-inspector-pin-dock";

interface PinnedDockSection {
  id: string;
  title: string;
  body: ReactNode;
}

const readHeight = (): number => {
  const n = readJSON<number>(HEIGHT_KEY, PIN_DOCK_DEFAULT);
  return Number.isFinite(n) && n >= PIN_DOCK_MIN ? n : PIN_DOCK_DEFAULT;
};

export function PinnedDock({ sections, onUnpin }: { sections: readonly PinnedDockSection[]; onUnpin(id: string): void }) {
  const [open, setOpen] = useState(() => readJSON<boolean>(OPEN_KEY, true));
  const [height, setHeight] = useState(readHeight);
  const live = useRef(height);
  const start = useRef(0);
  const { onPointerDown } = useDragGesture({
    onStart: (e) => {
      e.preventDefault();
      start.current = live.current;
    },
    onMove: (_e, m) => {
      const max = Math.max(PIN_DOCK_MIN, window.innerHeight * PIN_DOCK_MAX_RATIO);
      live.current = Math.max(PIN_DOCK_MIN, Math.min(max, start.current - m.dy));
      setHeight(live.current);
    },
    onEnd: () => writeJSON(HEIGHT_KEY, live.current),
  });
  const toggle = () =>
    setOpen((o) => {
      writeJSON(OPEN_KEY, !o);
      return !o;
    });

  if (!sections.length) return null;
  if (!open)
    return (
      <button type="button" data-pin-dock="collapsed" onClick={toggle} className="border-base-300 text-sidebar-foreground/70 hover:text-sidebar-foreground flex w-full shrink-0 items-center gap-1.5 border-t px-3 py-2.5 text-[11px] leading-none font-semibold tracking-wide uppercase transition-colors">
        <InspectorIcon name="pinned" className="size-3 shrink-0 opacity-70" />
        <span>Pinned</span>
        <Icon name="chevrons-up" className="ml-auto size-3" />
      </button>
    );

  return (
    <div data-pin-dock="open" className="relative z-[51] flex min-h-0 shrink-0 flex-col" style={{ height }} aria-label="Pinned inspector sections" role="region">
      <div onPointerDown={onPointerDown} data-pin-dock-resize="" className="border-base-300 hover:bg-primary/20 group flex h-1.5 w-full shrink-0 cursor-ns-resize items-center justify-center border-t transition-colors" aria-label="Resize pinned panel">
        <div className="bg-base-content/20 group-hover:bg-primary/50 h-0.5 w-8 rounded-full transition-colors" />
      </div>
      <div className="text-sidebar-foreground/70 border-base-300 flex shrink-0 items-center gap-1.5 border-b px-3 pt-1 pb-2">
        <InspectorIcon name="pinned" className="size-3 shrink-0 opacity-70" />
        <span className="text-[11px] font-semibold tracking-wide uppercase">Pinned</span>
        <button type="button" onClick={toggle} className="hover:bg-base-200 hover:text-base-content ml-auto rounded p-0.5 transition-colors" aria-label="Collapse pinned panel">
          <Icon name="chevrons-down" className="size-3" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {sections.map((s) => (
          <div key={s.id} data-pinned-section={s.id} className="border-base-300/80 flex min-h-0 min-w-0 flex-1 basis-0 flex-col border-b last:border-b-0">
            <div className="border-base-300 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
              <span className="text-sidebar-foreground/85 truncate text-[11px] font-semibold tracking-wide uppercase">{s.title}</span>
              <button type="button" onClick={() => onUnpin(s.id)} aria-label={`Unpin ${s.title}`} {...tooltip("Unpin from sidebar", "top")} data-tooltip-offset={6} className="text-sidebar-foreground/70 hover:text-sidebar-foreground inline-flex shrink-0 cursor-pointer items-center gap-1 rounded p-0.5 transition-colors">
                <InspectorIcon name="pinned" className="size-3" />
              </button>
            </div>
            <AutoHideScrollbar className="min-h-0 flex-1">
              <div className="bg-base-200 text-base-content grid items-end gap-3 p-3 pt-2" style={{ gridTemplateColumns: "repeat(1, 1fr)" }}>
                {s.body}
              </div>
            </AutoHideScrollbar>
          </div>
        ))}
      </div>
    </div>
  );
}
