/**
 * The default `Sidebar` slot: an `Edit | Layers | Add` tab header over the panes — Edit (breadcrumb
 * + the selected element's settings, or the `EmptyState` slot), Layers (the page tree), Add (the
 * insert drawer). The top bar lives above the sidebar, full width (see `Editor`).
 * - 360px docked; `min(360px, 100vw)` overlaying the canvas when the editor itself is under
 *   768px wide. Width / opacity animate over 200ms; docked on the right it moves last.
 * - Open by default except in a window ≤ 767px; hidden in preview and for a read-only viewer.
 * - A new non-empty selection opens it, unless the user closed it within the last 80ms.
 * - Overlay layout: swipe from the inner edge closes it; a "swipe to close" hint shows once per
 *   session for 4s.
 */
import { useEffect, useRef, useState } from "react";
import { Slot } from "../components";
import { useEditorState, useEditorStore } from "../react/bindings";
import { chromeOf } from "./chromeState";
import { addPanelOf } from "../features/add/addPanelState";
import { useSidebarSwipe } from "./useSidebarSwipe";
import { SidebarTabs, type SidebarTab } from "./SidebarTabs";

const PANEL_FRAME_ATTR = "data-ph-panel";
export const SIDEBAR_WIDTH = 360;
const OVERLAY_BELOW_PX = 768;
const NARROW_WINDOW_PX = 767;
export const MANUAL_CLOSE_COOLDOWN_MS = 80;
const SWIPE_HINT_MS = 4000;

/** True while the editor root (not the window) is narrower than 768px. */
function useOverlayLayout(el: HTMLElement | null): boolean {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    const root = el?.closest<HTMLElement>(".pagehub-editor");
    if (!root) return;
    const measure = () => {
      const w = root.getBoundingClientRect().width;
      setOverlay(w > 0 && w < OVERLAY_BELOW_PX);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [el]);
  return overlay;
}

/** A new non-empty selection opens the sidebar (not right after a manual close). */
function useAutoOpen(): void {
  const store = useEditorStore();
  const key = useEditorState((s) => s.selection.handles.map((h) => `${h.path}#${h.range.from}`).join("\0"));
  const last = useRef(key);
  useEffect(() => {
    const prev = last.current;
    last.current = key;
    if (!key || key === prev) return;
    if (Date.now() - chromeOf(store.state).sidebarClosedAt < MANUAL_CLOSE_COOLDOWN_MS) return;
    store.run("sidebar.open");
  }, [key, store]);
}

let hintShown = false;
/** Tests: show the hint again. */
export const resetSwipeHintForTests = () => void (hintShown = false);

function SwipeHint({ left }: { left: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (hintShown) return;
    hintShown = true;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), SWIPE_HINT_MS);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div aria-hidden="true" data-swipe-hint="" className={`pointer-events-none absolute bottom-6 z-[61] flex items-center gap-1.5 rounded-md bg-black/75 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition-opacity duration-500 ${left ? "right-2" : "left-2"}`}>
      <span>{left ? "←" : "→"}</span>
      <span>swipe to close</span>
    </div>
  );
}

export function Sidebar() {
  const store = useEditorStore();
  const aside = useRef<HTMLElement>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const c = useEditorState((s) => chromeOf(s));
  const readOnly = useEditorState(() => (store as { role?: string }).role === "viewer");
  const selected = useEditorState((s) => !!s.selection.primary?.alive);
  const overlay = useOverlayLayout(el);
  const open = c.sidebarOpen && !c.preview;
  const addOpen = useEditorState((s) => addPanelOf(s).open);
  const [tab, setTab] = useState<SidebarTab>("edit");
  // Add reflects the drawer's own state (opening it from a keybinding / the top bar lights the tab);
  // Edit and Layers are the sidebar's own.
  const activeTab: SidebarTab = addOpen ? "add" : tab;
  const pickTab = (next: SidebarTab) => {
    if (next === "add") return void store.run("insert.open");
    if (addOpen) store.run("insert.toggle"); // leaving Add closes the drawer
    setTab(next);
  };
  useAutoOpen();
  useEffect(() => {
    if (window.innerWidth <= NARROW_WINDOW_PX) store.run("sidebar.close", { auto: true });
  }, [store]);
  const swipe = useSidebarSwipe(aside, { enabled: open && overlay, left: c.sidebarLeft, onClose: () => store.run("sidebar.close") });
  if (readOnly) return <div data-slot="Sidebar" hidden />;

  const layout = overlay ? `absolute inset-y-0 z-[60] ${c.sidebarLeft ? "left-0" : "right-0"}` : `relative h-full shrink-0 grow-0 z-[60] ${c.sidebarLeft ? "" : "order-last"}`;
  const size = open ? (overlay ? "w-[min(360px,100vw)] opacity-100" : "w-[360px] opacity-100") : "w-0 opacity-0 pointer-events-none";
  return (
    <aside
      ref={(n) => {
        aside.current = n;
        if (n !== el) setEl(n);
      }}
      role="complementary"
      aria-label="Component settings"
      id="toolbar"
      data-slot="Sidebar"
      data-sidebar-open={open}
      data-sidebar-layout={overlay ? "overlay" : "docked"}
      {...{ [PANEL_FRAME_ATTR]: "" }}
      className={`text-sidebar-foreground border-sidebar-border bg-base-100 flex flex-col overflow-hidden border-x shadow-lg transition-[width,opacity] duration-200 ${layout} ${size}`}
      onPointerDown={swipe.onPointerDown}
    >
      <SidebarTabs value={activeTab} onChange={pickTab} />
      <div className="text-sidebar-foreground relative z-0 flex w-full flex-1 flex-col overflow-hidden antialiased select-none" aria-expanded={open}>
        {/* Every pane stays mounted (a host may replace or hide the slot); only the active one shows. */}
        <div hidden={activeTab !== "edit"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Slot name="Breadcrumb" />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{selected ? <Slot name="Inspector" /> : <Slot name="EmptyState" />}</div>
        </div>
        <div hidden={activeTab !== "layers"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Slot name="LayersPanel" />
        </div>
        <Slot name="AddPanel" />
      </div>
      {overlay && open && <SwipeHint left={c.sidebarLeft} />}
    </aside>
  );
}
