/**
 * AutoHideScrollbar — the one auto-hide chrome scroller. The native scrollbar is hidden
 * (`data-custom-scroll` → `scrollbar-width: none` + a webkit rule in the editor's styles.css) and we draw
 * our own thin thumb in the shared scrollbar colour (`--color-base-300`). The thumb fades in while
 * you scroll or hover, then fades out `hideDelay` ms after the last activity; dragging it scrolls.
 *
 *   <AutoHideScrollbar className="min-h-0 flex-1" data-inspector-scroll="">…</AutoHideScrollbar>
 *
 * - `ref` is the scrolling element, so callers can read/set `scrollTop` (the inspector's jump links).
 * - `onScroll` is called after the internal thumb/visibility update, same signature as the DOM prop.
 * - `variant`: `"slim"` (6px rail / 4px thumb, default) or `"regular"` (8px / 6px).
 * - `orientation`: `"vertical"` (default) or `"horizontal"`.
 * - Any remaining props (`id`, `data-*`, `aria-*`, `role`) spread onto the scrolling element.
 *
 * The thumb drag goes through `useDragGesture` (window pointer listeners), never React pointer props.
 */
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useDragGesture } from "./useDragGesture";

interface AutoHideScrollbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** ms of inactivity before the thumb fades (default 1000). */
  hideDelay?: number;
  orientation?: "vertical" | "horizontal";
  variant?: "slim" | "regular";
}

const RAIL = { slim: 6, regular: 8 } as const;
const THUMB = { slim: 4, regular: 6 } as const;

export const AutoHideScrollbar = React.forwardRef<HTMLDivElement, AutoHideScrollbarProps>(
  function AutoHideScrollbar(
    { children, className = "", style: styleProp, hideDelay = 1000, orientation = "vertical", variant = "slim", onScroll, ...rest },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(forwardedRef, () => containerRef.current as HTMLDivElement);
    const [thumb, setThumb] = useState({ size: 0, position: 0 });
    const [viewportSize, setViewportSize] = useState(0);
    const [visible, setVisible] = useState(false);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startScroll = useRef(0);

    const isVertical = orientation === "vertical";
    const rail = RAIL[variant];
    const thick = THUMB[variant];

    const updateThumb = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      if (isVertical) {
        const { scrollHeight, clientHeight, scrollTop } = el;
        setViewportSize(clientHeight);
        if (scrollHeight <= clientHeight) return setThumb({ size: 0, position: 0 });
        const size = Math.max((clientHeight / scrollHeight) * clientHeight, 20);
        const position = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - size);
        setThumb({ size, position });
      } else {
        const { scrollWidth, clientWidth, scrollLeft } = el;
        setViewportSize(clientWidth);
        if (scrollWidth <= clientWidth) return setThumb({ size: 0, position: 0 });
        const size = Math.max((clientWidth / scrollWidth) * clientWidth, 20);
        const position = (scrollLeft / (scrollWidth - clientWidth)) * (clientWidth - size);
        setThumb({ size, position });
      }
    }, [isVertical]);

    const show = useCallback(() => {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), hideDelay);
    }, [hideDelay]);

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        updateThumb();
        show();
        onScroll?.(e);
      },
      [updateThumb, show, onScroll],
    );

    const handleMouseEnter = useCallback(() => {
      updateThumb();
      show();
    }, [updateThumb, show]);

    const handleMouseLeave = useCallback(() => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 300);
    }, []);

    // Thumb drag: a gesture, so window listeners via useDragGesture (keeps the thumb visible until up).
    const { onPointerDown } = useDragGesture({
      onStart: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = containerRef.current;
        startScroll.current = el ? (isVertical ? el.scrollTop : el.scrollLeft) : 0;
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setVisible(true);
      },
      onMove: (_e, m) => {
        const el = containerRef.current;
        if (!el) return;
        if (isVertical) {
          const range = el.clientHeight - thumb.size;
          if (range <= 0) return;
          el.scrollTop = startScroll.current + (m.dy / range) * (el.scrollHeight - el.clientHeight);
        } else {
          const range = el.clientWidth - thumb.size;
          if (range <= 0) return;
          el.scrollLeft = startScroll.current + (m.dx / range) * (el.scrollWidth - el.clientWidth);
        }
      },
      onEnd: () => show(),
    });

    useEffect(() => {
      updateThumb();
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(updateThumb);
      ro.observe(el);
      return () => ro.disconnect();
    }, [updateThumb]);

    useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

    const hasThumb = thumb.size > 0;

    return (
      <div
        {...rest}
        ref={containerRef}
        data-custom-scroll=""
        className={className}
        style={{ overflowY: isVertical ? "auto" : "hidden", overflowX: isVertical ? "hidden" : "auto", scrollbarWidth: "none", ...styleProp }}
        onScroll={handleScroll}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {hasThumb && (
          <div
            aria-hidden="true"
            style={{
              position: "sticky",
              top: isVertical ? 0 : "auto",
              bottom: isVertical ? "auto" : 0,
              left: isVertical ? "auto" : 0,
              width: isVertical ? "100%" : viewportSize,
              height: isVertical ? 0 : "100%",
              overflow: "visible",
              zIndex: 30,
              flexShrink: 0,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: isVertical ? 0 : "auto",
                bottom: isVertical ? "auto" : 0,
                right: isVertical ? 0 : "auto",
                left: isVertical ? "auto" : 0,
                width: isVertical ? rail : viewportSize,
                height: isVertical ? viewportSize : rail,
                pointerEvents: "none",
              }}
            >
              <div
                onPointerDown={onPointerDown}
                style={{
                  position: "absolute",
                  right: isVertical ? 1 : "auto",
                  bottom: isVertical ? "auto" : 1,
                  top: isVertical ? thumb.position : "auto",
                  left: isVertical ? "auto" : thumb.position,
                  width: isVertical ? thick : thumb.size,
                  height: isVertical ? thumb.size : thick,
                  borderRadius: thick / 2,
                  backgroundColor: "var(--color-base-300)",
                  opacity: visible ? 1 : 0,
                  transition: "opacity 150ms ease",
                  cursor: "pointer",
                  pointerEvents: visible ? "auto" : "none",
                }}
              />
            </div>
          </div>
        )}
        {children}
      </div>
    );
  },
);
