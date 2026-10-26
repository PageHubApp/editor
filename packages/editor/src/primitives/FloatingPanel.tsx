/**
 * FloatingPanel — a draggable, resizable, non-modal window (colour picker, var picker, calc).
 * Not for centred dialogs: that is `Modal`.
 *
 *   <FloatingPanel isOpen={open} onClose={close} title="Color" storageKey="color" defaultWidth={280} defaultHeight={540}>
 *     …
 *   </FloatingPanel>
 *
 * - Drag: pointerdown on the header (not on its buttons); kept 12px inside the window; the
 *   position is not persisted. Resize: edges `e`, `s`, `se` by default; the size persists as
 *   `resizable-<storageKey>` unless `persistSize={false}`.
 * - Position: `initialPosition`, else docked (`dockToEdge`: x = vw − w − 12 or 8), else centred;
 *   y = 40.
 * - Size: `autoSize` (default) hugs the content within min / max until the first resize (or a
 *   stored size); `autoSize={false}` starts at `defaultWidth` × `defaultHeight`.
 * - Dismiss: Esc through the overlay stack (LIFO; focus is trapped while open); a pointerdown
 *   outside (capture, armed one frame after opening) closes it, except inside the panel, any
 *   portal registered with `useFloatingPanelPortalRegister()` (AnchoredPopover does), the parent
 *   panel, `ignoreOutsideClicks`, Headless UI portals and the tooltip.
 * - `headerless`: no title bar; render your own and wire `useFloatingPanelDrag()`.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "./a11y";
import { Icon } from "./icons";
import { AutoHideScrollbar } from "./AutoHideScrollbar";
import { onFrameFocus } from "./a11y";
import { useOverlay } from "./overlayStack";
import { OVERLAY_ROOT_CLASS, usePortalTarget } from "./portal";
import { useDraggableWindow, useResizable, type ResizeEdge } from "./useWindowFrame";
import { Z_FLOATING_PANEL } from "./zIndex";

interface PanelContext {
  registerPortal(node: HTMLElement): () => void;
  panelRef: RefObject<HTMLElement | null>;
}
const FloatingPanelContext = createContext<PanelContext | null>(null);

interface DragApi {
  onPointerDown(e: ReactPointerEvent): void;
  isDragging: boolean;
  onClose(): void;
}
const DragContext = createContext<DragApi | null>(null);

/** Mark a portalled descendant as "inside" the nearest panel. Null outside a panel. */
export const useFloatingPanelPortalRegister = () => useContext(FloatingPanelContext)?.registerPortal ?? null;
/** Drag / close API of the nearest panel, for a `headerless` panel's own header. */
const useFloatingPanelDrag = () => useContext(DragContext);

const INSET = 12;

export interface FloatingPanelProps {
  isOpen: boolean;
  onClose(): void;
  title: string;
  icon?: ReactNode;
  storageKey: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  edges?: readonly ResizeEdge[];
  persistSize?: boolean;
  autoSize?: boolean;
  initialPosition?: { x: number; y: number };
  dockToEdge?: "left" | "right";
  closeButtonSide?: "left" | "right";
  zIndex?: number;
  /** Wrap children in a scrolling, padded body. */
  scrollable?: boolean;
  bodyClassName?: string;
  backdrop?: boolean;
  backdropCloseOnClick?: boolean;
  ignoreOutsideClicks?: ReadonlyArray<RefObject<HTMLElement | null>>;
  headerless?: boolean;
  children: ReactNode;
}

const DEFAULT_EDGES: readonly ResizeEdge[] = ["e", "s", "se"];

export function FloatingPanel(props: FloatingPanelProps) {
  // Mount the window only while open so position and size start fresh from the props.
  return props.isOpen ? <OpenPanel {...props} /> : null;
}

function startPosition(p: FloatingPanelProps, width: number) {
  if (p.initialPosition) return p.initialPosition;
  const vw = window.innerWidth;
  if (p.dockToEdge === "right") return { x: Math.max(8, vw - width - INSET), y: 40 };
  if (p.dockToEdge === "left") return { x: 8, y: 40 };
  return { x: Math.round(vw / 2 - width / 2), y: 40 };
}

function OpenPanel(p: FloatingPanelProps) {
  const { onClose, title, storageKey, zIndex = Z_FLOATING_PANEL, autoSize = true, ignoreOutsideClicks } = p;
  const minWidth = p.minWidth ?? 300;
  const minHeight = p.minHeight ?? 300;
  const [vp, setVp] = useState({ width: window.innerWidth, height: window.innerHeight });
  const maxWidth = Math.max(180, Math.min(p.maxWidth ?? 1200, vp.width - INSET * 2));
  const maxHeight = Math.max(180, Math.min(p.maxHeight ?? Math.round(vp.height * 0.95), vp.height - INSET * 2));
  const widthHint = p.defaultWidth ?? 320;

  const { position, setPosition, dragging, windowRef, onHandlePointerDown } = useDraggableWindow(startPosition(p, widthHint), INSET);
  const resizable = useResizable({
    storageKey,
    initial: { width: widthHint, height: p.defaultHeight ?? 360 },
    min: { width: minWidth, height: minHeight },
    max: { width: maxWidth, height: maxHeight },
    edges: p.edges ?? DEFAULT_EDGES,
    persist: p.persistSize ?? true,
    onOriginShift: (dx, dy) => setPosition((q) => ({ x: q.x + dx, y: q.y + dy })),
  });
  const [resized, setResized] = useState(resizable.hasStoredSize);
  if (resizable.resizing && !resized) setResized(true);
  const fit = autoSize && !resized;

  const trapRef = useFocusTrap(true);
  useOverlay({ id: `floating-panel:${storageKey}`, isOpen: true, onDismiss: onClose });

  const portals = useRef(new Set<HTMLElement>());
  const registerPortal = useCallback((node: HTMLElement) => {
    portals.current.add(node);
    return () => void portals.current.delete(node);
  }, []);
  const selfRef = useRef<HTMLElement | null>(null);
  const ctx = useMemo(() => ({ registerPortal, panelRef: selfRef }), [registerPortal]);
  const parent = useContext(FloatingPanelContext);

  useEffect(() => (parent && selfRef.current ? parent.registerPortal(selfRef.current) : undefined), [parent]);

  // While fitting the content, mirror the measured size so a resize starts from it.
  useEffect(() => {
    const el = windowRef.current;
    if (!fit || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) resizable.setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, resizable.setSize, windowRef]);

  const width = fit ? undefined : resizable.size.width;
  const height = fit ? undefined : resizable.size.height;

  useLayoutEffect(() => {
    if (p.dockToEdge) setPosition({ x: p.dockToEdge === "right" ? Math.max(8, vp.width - (width ?? widthHint) - INSET) : 8, y: 40 });
    else if (!fit)
      setPosition((q) => ({
        x: Math.max(INSET, Math.min(q.x, Math.max(INSET, vp.width - (width ?? 0) - INSET))),
        y: Math.max(INSET, Math.min(q.y, Math.max(INSET, vp.height - (height ?? 0) - INSET))),
      }));
  }, [p.dockToEdge, fit, width, height, widthHint, vp.width, vp.height, setPosition]);

  useEffect(() => {
    const onResize = () => setVp({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let armed = false;
    const raf = requestAnimationFrame(() => void (armed = true));
    // capture: runs before Headless UI detaches a picked option's portal
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!armed || !t) return;
      if (windowRef.current?.contains(t) || parent?.panelRef.current?.contains(t)) return;
      for (const node of portals.current) if (node.contains(t)) return;
      if (ignoreOutsideClicks?.some((r) => r.current?.contains(t))) return;
      if (t.closest("[data-headlessui-portal], [data-rtt-tooltip], .react-tooltip")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    const offFrame = onFrameFocus(onClose);
    return () => {
      cancelAnimationFrame(raf);
      offFrame();
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose, windowRef, ignoreOutsideClicks, parent]);

  const target = usePortalTarget();
  if (!target) return null;

  const close = (
    <button type="button" onClick={onClose} aria-label="Close" className="text-accent-content hover:bg-accent-content/10 rounded p-0.5 transition-colors">
      <Icon name="x" className="size-3.5" />
    </button>
  );
  const heading = (
    <div className="flex min-w-0 items-center gap-1.5">
      {p.icon}
      <span className="text-xs font-semibold">{title}</span>
    </div>
  );

  return createPortal(
    <FloatingPanelContext.Provider value={ctx}>
      {p.backdrop && <div className={`${OVERLAY_ROOT_CLASS} ph-modal-backdrop`} style={{ zIndex: zIndex - 1 }} onClick={p.backdropCloseOnClick === false ? undefined : onClose} aria-hidden="true" />}
      <div
        ref={(el) => {
          windowRef.current = el;
          trapRef.current = el;
          selfRef.current = el;
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-ph-floating-panel={storageKey}
        className={`${OVERLAY_ROOT_CLASS} ph-modal-surface border-base-300 bg-base-100 rounded-box border shadow-xl pointer-events-auto fixed overflow-hidden`}
        style={{ top: position.y, left: position.x, width, height, minWidth, maxWidth, minHeight, maxHeight, zIndex }}
      >
        {resizable.handles.map((h) => (
          <div key={h.edge} data-resize-edge={h.edge} style={h.style} onPointerDown={h.onPointerDown} />
        ))}
        <DragContext.Provider value={{ onPointerDown: onHandlePointerDown, isDragging: dragging, onClose }}>
          <div className={autoSize ? "flex max-h-full flex-col" : "flex h-full flex-col"}>
            {!p.headerless && (
              <div data-drag-handle="" onPointerDown={onHandlePointerDown} className={`text-base-content flex touch-none items-center justify-between px-3 py-1.5 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}>
                {p.closeButtonSide === "left" ? (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      {close}
                      {heading}
                    </div>
                    <span className="size-5" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    {heading}
                    {close}
                  </>
                )}
              </div>
            )}
            {p.scrollable ? (
              <AutoHideScrollbar className="min-h-0 flex-1">
                <div className={p.bodyClassName ?? "text-base-content flex flex-col gap-2 p-3 text-xs"}>{p.children}</div>
              </AutoHideScrollbar>
            ) : (
              p.children
            )}
          </div>
        </DragContext.Provider>
      </div>
    </FloatingPanelContext.Provider>,
    target,
  );
}
