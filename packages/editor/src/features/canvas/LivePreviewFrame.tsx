/**
 * The live preview frame: the saved draft from the host's `previewUrl`, with the site's own scripts running, in a
 * sandboxed frame the editor never reaches into (see `livePreview.ts` for the origin rules and the message shapes).
 *
 * - Entering saves pending edits first ("Saving your changes…"), then loads the page the canvas shows.
 * - Every save reloads the frame at the page and scroll position it was on ("Reloading…").
 * - Choosing a page in the editor loads it; following a link inside the preview moves the page selector along.
 * Sized like the canvas frame, so device frames, breakpoints and zoom frame it the same way.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Path } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { isCore } from "../../react/events";
import { Spinner } from "../../primitives/Spinner";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { autosaveOf } from "../save/useAutosave";
import { pageInfo, pagesRoot } from "../topbar/pages";
import { useCanvasHost } from "./canvasHost";
import { canvasPage, pageFiles } from "./canvasState";
import { liveBasePath, liveFrameOrigin, liveFrameSandbox, readLiveMessage, routeOfLivePath } from "./livePreview";

/** The preview pill's "Run site scripts" switch (next to Edit). */
export function LivePreviewToggle({ on }: { on: boolean }) {
  const run = useRunCommand();
  const tip = on ? "Back to the canvas preview, without the site's scripts" : "Show the saved page with the site's own scripts running";
  return (
    <button
      type="button"
      data-live-preview-toggle=""
      aria-pressed={on}
      onClick={() => run("preview.live")}
      className={`btn btn-sm gap-1.5 rounded-full shadow-lg ${on ? "bg-base-content text-base-100 hover:bg-base-content/90 border-transparent" : "bg-base-100 text-base-content border-base-300 hover:bg-base-200"}`}
      {...tooltip(tip, "top")}
    >
      <Icon name="code" className="size-4" />
      Run site scripts
    </button>
  );
}

type Phase ="saving" | "loading" | "reloading" | "ready";

const sameList = (a: readonly Path[], b: readonly Path[]) => a.length === b.length && a.every((p, i) => p === b[i]);
const pathOf = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

export function LivePreviewFrame({ className = "", style }: { className?: string; style?: CSSProperties }) {
  const store = useEditorStore();
  const run = useRunCommand();
  const host = useCanvasHost();
  const current = useEditorState(canvasPage);
  const pages = useEditorState(pageFiles, sameList);
  const pagesDir = useEditorState((s) => pagesRoot(s.files.keys()));
  const entries = host?.pages?.();
  const here = typeof location === "undefined" ? "http://localhost/" : location.href;
  const route = current ? pageInfo(current, pagesDir, entries).route : "/";
  const raw = host?.previewUrl?.(route) ?? null;
  const src = raw ? new URL(raw, here).href : null;
  const base = liveBasePath(host?.previewUrl?.("/") ?? "", here);
  const origin = src ? liveFrameOrigin(src, here) : "";
  const sandbox = src ? liveFrameSandbox(src, here) : "";

  const frame = useRef<HTMLIFrameElement>(null);
  const at = useRef<{ path: string | null; y: number }>({ path: null, y: 0 });
  const [phase, setPhase] = useState<Phase>("loading");
  const [stale, setStale] = useState(false);
  const saving = useRef(false);
  /** The frame has been sent to the preview (its first `load` is the empty frame's, not the page's). */
  const navigated = useRef(false);
  /** Where to scroll once the page loads (the page reports its own position, 0, before its `load`). */
  const restoreY = useRef(0);

  /** Navigate the frame to `path` (under the preview's origin) and restore `y` once it loads. */
  const load = (path: string, y: number, next: Phase) => {
    const el = frame.current;
    if (!el || !src) return;
    at.current = { path, y };
    restoreY.current = y;
    navigated.current = true;
    setPhase(next);
    el.src = new URL(path, src).href;
  };

  // Enter: save pending edits first, then load the page. A save that can't happen shows the last saved version.
  useEffect(() => {
    if (!src) return;
    const core = isCore(store) ? store : null;
    if (!core || !core.dirty().length) return load(pathOf(src), 0, "loading");
    saving.current = true;
    setPhase("saving");
    const auto = autosaveOf(store);
    void (auto ? auto.flush() : core.save().catch(() => null)).then(() => {
      saving.current = false;
      setStale(core.dirty().length > 0);
      load(pathOf(src), 0, "loading");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every later save reloads the frame where it was.
  useEffect(() => {
    if (!isCore(store)) return;
    const core = store;
    return core.on("saved", () => {
      if (saving.current || !src) return;
      setStale(core.dirty().length > 0);
      load(at.current.path ?? pathOf(src), at.current.y, "reloading");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, src]);

  // A page chosen in the editor loads, unless the frame is already on it (it followed a link there).
  useEffect(() => {
    if (!src || saving.current || at.current.path === null) return;
    const shown = at.current.path.split(/[?#]/)[0];
    if (shown === new URL(src).pathname) return;
    load(pathOf(src), 0, "loading");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // The frame reports where it is; following a link to another page moves the page selector there.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const loc = readLiveMessage(e, { source: frame.current?.contentWindow ?? null, origin, basePath: base });
      if (!loc) return;
      at.current = loc;
      const r = routeOfLivePath(loc.path, base);
      if (!r || r === route) return;
      const page = pages.find((p) => pageInfo(p, pagesDir, entries).route === r);
      if (page && page !== current) run("canvas.set", { page });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, base, route, pages, pagesDir, entries, current, run]);

  const onLoad = () => {
    if (!navigated.current) return;
    setPhase("ready");
    const y = restoreY.current;
    restoreY.current = 0;
    // "*": an opaque (sandboxed) frame has no origin to name; the message is a scroll offset, nothing private.
    if (y > 0) frame.current?.contentWindow?.postMessage({ type: "ph-live-scroll", y }, origin === "null" ? "*" : origin);
  };

  if (!src) return null;
  const status = phase === "saving" ? "Saving your changes…" : phase === "reloading" ? "Reloading with your changes…" : phase === "loading" ? "Loading the page…" : null;
  return (
    <>
      <iframe
        ref={frame}
        data-live-preview=""
        data-live-phase={phase}
        aria-label="Live preview"
        sandbox={sandbox}
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        className={`block h-full w-full border-0 bg-white ${className}`}
        style={style}
      />
      {status && (
        <div role="status" data-live-status="" className="bg-base-100 text-base-content border-base-300 pointer-events-none absolute top-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow" style={{ zoom: "var(--device-zoom-inverse, 1)" }}>
          <Spinner className="size-3.5" />
          {status}
        </div>
      )}
      {!status && stale && (
        <div role="status" data-live-stale="" className="bg-base-100 text-base-content border-base-300 pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded-full border px-3 py-1.5 text-xs shadow" style={{ zoom: "var(--device-zoom-inverse, 1)" }}>
          Some changes aren't saved yet, so they aren't in this preview.
        </div>
      )}
    </>
  );
}
