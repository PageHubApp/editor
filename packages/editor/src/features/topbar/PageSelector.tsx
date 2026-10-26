/**
 * The default `PageSelector` slot: the page switcher that fills the top bar's address pill
 * (`TopBar`), styled like the current editor's browser-style address bar — a home / file icon,
 * the page's name, a chevron, then a round "open in a new tab" link. The trigger stretches to
 * fill the pill. The list is titled "Pages", gets a search field at 8+ pages ("No pages found"),
 * and shows each page's name and route. A deleted page falls back to the home page.
 */
import { useRef, useState } from "react";
import type { Path } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { tooltip } from "../../primitives/tooltip";
import { canvasPage, pageFiles } from "../canvas/canvasState";
import { useCanvasHost } from "../canvas/canvasHost";
import { Icon } from "../../primitives/icons";
import { Spinner } from "../../primitives/Spinner";
import { useDelayedFlag } from "../../primitives/useDelayedFlag";
import { useRenderStatus } from "../canvas/renderStatus";
import { PAGE_SEARCH_MIN, pageInfo, pagesRoot } from "./pages";

const sameList = (a: readonly Path[], b: readonly Path[]) => a.length === b.length && a.every((p, i) => p === b[i]);

export function PageSelector() {
  const run = useRunCommand();
  const store = useEditorStore();
  const canvasHost = useCanvasHost();
  const pages = useEditorState(pageFiles, sameList);
  const current = useEditorState(canvasPage);
  // busy from the moment a page is chosen until the canvas has painted it (shown only past the loading delay)
  const status = useRenderStatus(store);
  const switching = useDelayedFlag(!!current && status.pending && status.painted !== current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pagesDir = useEditorState((s) => pagesRoot(s.files.keys()));
  const entries = canvasHost?.pages?.();
  const infoOf = (p: Path) => pageInfo(p, pagesDir, entries);
  const shown = pages.filter((p) => infoOf(p).name.toLowerCase().includes(query.toLowerCase()));
  if (!current) return <div data-slot="PageSelector" hidden />;

  const { route, name: currentName } = infoOf(current);
  const home = route === "/";
  const previewUrl = canvasHost?.previewUrl?.(route) ?? null;
  return (
    <div ref={root} data-slot="PageSelector" className="relative flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        data-page-trigger=""
        aria-label="Page selector"
        aria-expanded={open}
        aria-busy={switching}
        onClick={() => (open ? close() : setOpen(true))}
        className="hover:text-base-content text-base-content/70 flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full text-left text-sm font-medium transition-colors focus:outline-none"
        {...tooltip(`${currentName} — ${route}`, "bottom")}
      >
        {switching ? <Spinner className="size-4 shrink-0 opacity-70" label="Loading page" /> : <Icon name={home ? "home" : "file-text"} className="size-4 shrink-0 opacity-70" />}
        <span className={`min-w-0 flex-1 truncate ${switching ? "opacity-60" : ""}`}>{currentName}</span>
        <Icon name="chevron-down" className={`size-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {previewUrl && (
        <a data-page-open="" className="text-base-content/50 hover:bg-base-content/10 hover:text-base-content inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors" href={previewUrl} target="_blank" rel="noopener noreferrer" aria-label="Open page in a new tab" {...tooltip("Open page in a new tab", "bottom")}>
          <Icon name="external-link" className="size-3.5" />
        </a>
      )}
      <AnchoredPopover open={open} onOpenChange={(o) => !o && close()} anchor={root} immediate placement="bottom-start" mainAxisOffset={6} maxHeightCeiling={500} className="ph-panel bg-base-100 text-base-content border-base-300 flex min-w-[280px] flex-col overflow-hidden rounded-lg border shadow-lg">
        <div data-page-menu="" className="flex min-h-0 flex-1 flex-col">
          {pages.length >= PAGE_SEARCH_MIN ? (
            <div className="border-base-300 border-b p-2">
              <input autoFocus type="search" data-page-search="" aria-label="Search pages" placeholder="Search pages..." value={query} onChange={(e) => setQuery(e.target.value)} className="input input-sm w-full" />
            </div>
          ) : (
            <div className="border-base-300 text-base-content/60 border-b px-3 py-2 text-[10px] font-medium tracking-wide uppercase">Pages</div>
          )}
          <div className="scrollbar bg-base-100 text-base-content flex-1 overflow-y-auto" role="listbox" aria-label="Pages">
            {shown.map((p) => {
              const { route: r, name } = infoOf(p);
              const selected = p === current;
              return (
                <div key={p} className={`group flex w-full items-center gap-2 border-l-2 px-3 py-2 transition-colors ${selected ? "border-primary bg-base-200 text-base-content font-medium" : "hover:border-base-300 hover:bg-base-200/60 text-base-content/80 hover:text-base-content border-transparent"}`}>
                  <button type="button" role="option" aria-selected={selected} data-page-row={p} className="flex flex-1 items-center gap-2 overflow-hidden text-left" onClick={() => (run("canvas.set", { page: p }), close())}>
                    <Icon name={r === "/" ? "home" : "file-text"} className={`text-base-content size-4 shrink-0 ${r === "/" ? "" : "opacity-80"}`} />
                    <div className="flex flex-1 items-center justify-between gap-2 overflow-hidden">
                      <span className="text-base-content truncate text-sm">{name}</span>
                      <span className="text-base-content/60 truncate text-xs">{r}</span>
                    </div>
                  </button>
                </div>
              );
            })}
            {!shown.length && query && <div className="text-base-content/60 px-3 py-4 text-center text-sm">No pages found</div>}
          </div>
        </div>
      </AnchoredPopover>
    </div>
  );
}
