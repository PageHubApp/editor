/**
 * Inspector search: the floating popup and the match highlight.
 *
 *   <SearchPopup open at={{ x, y }} query={q} onQuery={setQ} onClose={close} />
 *   useSearchHighlight(resultsRef, q)
 *
 * - The popup (280×40) opens at the pointer, kept 8px inside the window; the input is focused
 *   after 50ms. Enter, Escape (the overlay stack) or a pointerdown outside closes it; the query
 *   stays applied. Clearing = reopen and empty the input.
 * - Matches in the results are painted with the CSS Custom Highlight API
 *   (`::highlight(inspector-search)`), so the DOM is never rewritten.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useOverlay } from "../../primitives/overlayStack";
import { Icon } from "../../primitives/icons";
import { NO_AUTOCOMPLETE } from "../toolbar/ToolbarItemView";

export const SEARCH_POPUP = { width: 280, height: 40, pad: 8, focusDelay: 50 } as const;
const HIGHLIGHT_NAME = "inspector-search";

/** Popup position for a pointer at (x, y): centred on x, below y, kept inside the window. */
export function searchPopupPosition(x: number, y: number, win: { innerWidth: number; innerHeight: number } = window): { x: number; y: number } {
  const { width, height, pad } = SEARCH_POPUP;
  return {
    x: Math.min(Math.max(x - width / 2, pad), win.innerWidth - width - pad),
    y: Math.min(Math.max(y + pad, pad), win.innerHeight - height - pad),
  };
}

interface SearchPopupProps {
  open: boolean;
  at: { x: number; y: number } | null;
  query: string;
  onQuery(q: string): void;
  onClose(): void;
}

export function SearchPopup({ open, at, query, onQuery, onClose }: SearchPopupProps) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useOverlay({ id: "inspector-search", isOpen: open, onDismiss: onClose });
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), SEARCH_POPUP.focusDelay);
    const down = (e: PointerEvent) => {
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", down);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", down);
    };
  }, [open, onClose]);
  if (!open) return null;
  const pos = at ?? searchPopupPosition(window.innerWidth / 2, 0);
  return (
    <div ref={box} data-inspector-search="" className="border-base-300 bg-base-100 fixed z-[100] flex items-center rounded-xl border px-2 py-1.5 shadow-xl" style={{ left: pos.x, top: pos.y, width: SEARCH_POPUP.width }}>
      <Icon name="search" className="text-base-content/50 mr-1.5 size-3.5 shrink-0" />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search settings..."
        aria-label="Search settings"
        className="input-plain min-w-0 flex-1 bg-transparent text-xs outline-none"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onClose();
        }}
        {...NO_AUTOCOMPLETE}
      />
    </div>
  );
}

interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}

/** Paint every case-insensitive match of `query` inside `root` with `::highlight(inspector-search)`. */
export function useSearchHighlight(root: RefObject<HTMLElement | null>, query: string): void {
  useLayoutEffect(() => {
    const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
    const Ctor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    const q = query.trim().toLowerCase();
    if (!registry || !Ctor || !root.current || !q) return;
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(root.current, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").toLowerCase();
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + q.length);
        ranges.push(r);
      }
    }
    registry.set(HIGHLIGHT_NAME, new Ctor(...ranges));
    return () => registry.delete(HIGHLIGHT_NAME);
  });
}

/** The stylesheet rule for the highlight (rendered once with the results). */
export const HIGHLIGHT_CSS = `::highlight(${HIGHLIGHT_NAME}){background-color:color-mix(in oklab,var(--color-warning,#facc15) 45%,transparent);color:inherit}`;
