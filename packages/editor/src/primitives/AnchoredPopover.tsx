/**
 * AnchoredPopover — the one anchored popover / dropdown surface (selects, pickers, searchable
 * menus, the breakpoint-chip popover). Not for draggable windows: that is `FloatingPanel`.
 *
 *   <AnchoredPopover open={open} onOpenChange={setOpen} anchor={buttonRef}>…</AnchoredPopover>
 *   <AnchoredPopover open anchorRect={rect} onOpenChange={…}>…</AnchoredPopover>
 *
 * - Floating UI: `bottom-start`, offset 4, flip, shift padding 8, fixed strategy, auto-update;
 *   `maxHeightCeiling` caps the height to the space available; `matchAnchorWidth` clamps the
 *   min width to the anchor's.
 * - Portalled, z-index 60 (`Z_ANCHORED`), `data-state` drives the CSS fade; unmounts 75ms after
 *   closing so the exit fade plays (`immediate` skips it).
 * - Dismiss: pointerdown outside (capture; right-click ignored; the anchor and
 *   `ignoreOutsideClicks` count as inside), the window losing focus (a click into the canvas
 *   iframe) and Esc through the overlay stack.
 *   `disableDismiss` leaves both to the parent.
 * - Inside a FloatingPanel it registers its root so clicks in it don't close that panel. Inside
 *   another AnchoredPopover it registers with that one (and its ancestors): a nested listbox is
 *   its own AnchoredPopover, portalled out of the parent's scroll box so it is never clipped, and
 *   a press in it still counts as inside the parent.
 * - `fitContent` (nested listboxes): min width = the anchor's, grows to its widest option, height
 *   capped to the space available.
 */
import { autoUpdate, flip, offset, shift, size, useFloating, type FlipOptions, type Middleware, type Placement } from "@floating-ui/react-dom";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { onFrameFocus } from "./a11y";
import { useFloatingPanelPortalRegister } from "./FloatingPanel";
import { useOverlay } from "./overlayStack";
import { usePortalTarget } from "./portal";
import { Z_ANCHORED } from "./zIndex";

const POPOVER_FADE_MS = 75;

export interface AnchoredPopoverProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Ref or element. Use `anchorRect` instead for a captured position (context menus). */
  anchor?: RefObject<HTMLElement | null> | HTMLElement | null;
  anchorRect?: DOMRect | null;
  placement?: Placement;
  mainAxisOffset?: number;
  crossAxisOffset?: number;
  flipOptions?: FlipOptions;
  shiftPadding?: number;
  maxHeightCeiling?: number;
  /** Nested listbox sizing: max height in px; min width = the anchor's; width grows to content. */
  fitContent?: number;
  matchAnchorWidth?: { min: number; max: number };
  immediate?: boolean;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
  portalTarget?: HTMLElement | null;
  ignoreOutsideClicks?: ReadonlyArray<RefObject<HTMLElement | null>>;
  disableDismiss?: boolean;
  children: ReactNode;
}

const resolve = (a: AnchoredPopoverProps["anchor"]): HTMLElement | null => (!a ? null : a instanceof HTMLElement ? a : a.current);

export function AnchoredPopover({
  open,
  onOpenChange,
  anchor,
  anchorRect,
  placement = "bottom-start",
  mainAxisOffset = 4,
  crossAxisOffset = 0,
  flipOptions,
  shiftPadding = 8,
  maxHeightCeiling,
  fitContent,
  matchAnchorWidth,
  immediate = false,
  zIndex = Z_ANCHORED,
  className,
  style,
  portalTarget,
  ignoreOutsideClicks,
  disableDismiss = false,
  children,
}: AnchoredPopoverProps) {
  // Render with data-state = open on insert (the CSS entrance runs on insert); keep mounted
  // for the exit fade.
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<"open" | "closed">(open ? "open" : "closed");
  useEffect(() => {
    if (open) {
      setMounted(true);
      setState("open");
      return;
    }
    setState((s) => (s === "open" ? "closed" : s));
    if (immediate) return void setMounted(false);
    const t = window.setTimeout(() => setMounted(false), POPOVER_FADE_MS);
    return () => window.clearTimeout(t);
  }, [open, immediate]);

  const minW = matchAnchorWidth?.min;
  const maxW = matchAnchorWidth?.max;
  const middleware = useMemo(() => {
    const list: Middleware[] = [offset({ mainAxis: mainAxisOffset, crossAxis: crossAxisOffset }), flip(flipOptions), shift({ padding: shiftPadding })];
    if (fitContent != null)
      list.push(
        size({
          padding: shiftPadding,
          apply({ availableHeight, rects, elements }) {
            const s = elements.floating.style;
            s.maxHeight = `${Math.max(0, Math.min(fitContent, availableHeight))}px`;
            s.minWidth = `${rects.reference.width}px`;
            s.maxWidth = `calc(100vw - ${shiftPadding * 2}px)`;
          },
        }),
      );
    else if (maxHeightCeiling != null)
      list.push(
        size({
          apply({ availableHeight, rects, elements }) {
            elements.floating.style.maxHeight = `${Math.max(0, Math.min(maxHeightCeiling, availableHeight))}px`;
            if (minW != null && maxW != null) elements.floating.style.minWidth = `${Math.min(Math.max(rects.reference.width, minW), maxW)}px`;
          },
        }),
      );
    return list;
  }, [mainAxisOffset, crossAxisOffset, flipOptions, shiftPadding, maxHeightCeiling, fitContent, minW, maxW]);

  const floating = useFloating({ open: mounted, placement, strategy: "fixed", middleware, whileElementsMounted: autoUpdate });
  const { refs } = floating;

  useLayoutEffect(() => {
    if (!mounted) return;
    refs.setReference(anchorRect ? { getBoundingClientRect: () => anchorRect } : resolve(anchor));
  }, [mounted, anchor, anchorRect, refs]);

  const dismiss = !disableDismiss && open;
  const nested = useRef(new Set<HTMLElement>());
  const latest = useRef({ onOpenChange, ignoreOutsideClicks });
  latest.current = { onOpenChange, ignoreOutsideClicks };
  useEffect(() => {
    if (!dismiss) return;
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) return;
      const t = e.target as Node;
      const ref = refs.reference.current as Element | null;
      if ((ref && "contains" in ref && ref.contains(t)) || refs.floating.current?.contains(t)) return;
      if ([...nested.current].some((n) => n.contains(t))) return;
      // A Headless UI list opened from inside (ToolbarDropdown) portals to <body> on its own.
      if (t instanceof Element && t.closest("[data-headlessui-portal]")) return;
      if (latest.current.ignoreOutsideClicks?.some((r) => r.current?.contains(t))) return;
      latest.current.onOpenChange(false);
    };
    // A press inside the canvas iframe never reaches this document; focus moving into it blurs the
    // window instead, so that dismisses too.
    document.addEventListener("pointerdown", onDown, true);
    const offFrame = onFrameFocus(() => latest.current.onOpenChange(false));
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      offFrame();
    };
  }, [dismiss, refs]);

  const id = useId();
  useOverlay({ id: `anchored-popover:${id}`, isOpen: dismiss, onDismiss: () => latest.current.onOpenChange(false) });

  const register = useFloatingPanelPortalRegister();
  const registerInParent = useContext(PopoverNestContext);
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => (node && register ? register(node) : undefined), [node, register]);
  useEffect(() => (node && registerInParent ? registerInParent(node) : undefined), [node, registerInParent]);
  // Nested popovers (a listbox opened from a field inside this one) register here, and up the
  // chain, so a press in them counts as inside every ancestor popover.
  const registerNested = useCallback(
    (el: HTMLElement) => {
      nested.current.add(el);
      const up = registerInParent?.(el);
      return () => {
        nested.current.delete(el);
        up?.();
      };
    },
    [registerInParent],
  );

  const target = usePortalTarget(portalTarget);
  if (!mounted || !target) return null;
  return createPortal(
    <div
      ref={(el) => {
        refs.setFloating(el);
        setNode(el);
      }}
      data-ph-popover=""
      data-state={state}
      style={{ ...floating.floatingStyles, zIndex, ...style }}
      className={className}
    >
      <PopoverNestContext.Provider value={registerNested}>{children}</PopoverNestContext.Provider>
    </div>,
    target,
  );
}

/** Registers a portalled descendant surface with the enclosing AnchoredPopover chain. */
const PopoverNestContext = createContext<((el: HTMLElement) => () => void) | null>(null);
