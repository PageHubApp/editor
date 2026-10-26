// The canvas slot: scope band, coachmark, and the scroll box holding the page frame.
/**
 * The default `Canvas` slot: scope band, coachmark, and the `#viewport` scroll box holding the
 * page frame — fluid on desktop, a capped / exact width box for a breakpoint, or a device frame.
 * A device frame gets its header bar (phone presets, W × H, zoom) and external scrollbar; the
 * breakpoint lines draw over a non-device canvas when turned on.
 * Zoom is CSS `zoom` on the frame box (`--device-zoom-inverse` keeps chrome crisp); while
 * "Fit to window" is on, the zoom follows the editor's own box. The overlay slots
 * (`CanvasOverlays`, `NodeTools`, `InlineTextToolbar`) and drag and drop (`CanvasDnd`)
 * render in one layer above.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Slot } from "../../components";
import { profileFacet } from "@pagehub/engine/host";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { chromeOf } from "../../shell/chromeState";
import { CanvasFrameContext, type CanvasFrameInfo } from "./canvasContext";
import { CanvasFrame } from "./CanvasFrame";
import { CanvasDnd } from "../dnd/CanvasDnd";
import { MirrorFrame } from "./MirrorFrame";
import { canvasOf } from "./canvasState";
import { DeviceGuides, EdgeHandles, PreviewEditButton, ScopeBand, ScopeCoachmark } from "./ViewportParts";
import { canvasBoxStyle, defaultView, deviceFrame, fitModeFor, fitZoom, viewWidth } from "./viewportMath";
import { useBreakpointWidths } from "./useBreakpointWidths";
import { useScrollOnSwitch } from "./useScrollOnSwitch";
import { useZoomPersistence } from "./useZoomPersistence";
import { DeviceHeader, DeviceScrollbar } from "./DeviceHeader";
import { BreakpointMarkers } from "./BreakpointMarkers";
import { useCanvasHost } from "./canvasHost";
import { livePreviewOf } from "./livePreview";
import { LivePreviewFrame, LivePreviewToggle } from "./LivePreviewFrame";

export function Viewport() {
  const run = useRunCommand();
  const view = useUi((u) => u.view);
  const multiScope = useUi((u) => u.multiScope);
  const canvas = useEditorState(canvasOf);
  const fit = useEditorState((s) => chromeOf(s).fit);
  // An editing profile with a fixed width (an email: 600px) has no breakpoint views, device frames or width handles,
  // and shows at 100% unless fit-to-window is on (a zoom remembered from the site editor never applies).
  const locked = useEditorState((s) => s.facet(profileFacet)?.canvasWidth ?? null);
  const zoom = useEditorState((s) => (locked && !chromeOf(s).fit ? 1 : chromeOf(s).zoom));
  const preview = useEditorState((s) => chromeOf(s).preview);
  const liveOn = useEditorState(livePreviewOf);
  const canvasHost = useCanvasHost();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<CanvasFrameInfo>({ frame: null, doc: null, version: 0, host: null });
  const [frameBox, setFrameBox] = useState<HTMLElement | null>(null);
  const bp = useBreakpointWidths().values;
  const phone = view === "mobile" ? canvas.phone : undefined;
  useZoomPersistence(view, canvas.device);
  useScrollOnSwitch(info.doc, view, canvas.device, canvas.responsive, canvas.mirror);

  // first mount: a narrow window starts on the mobile view
  useEffect(() => {
    if (!locked && view === "desktop" && defaultView(window.innerWidth) === "mobile") run("ui.set", { view: "mobile" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fit-to-window follows the editor's own box
  useEffect(() => {
    const el = root.current;
    if (!el || !fit) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // A locked width fits that width (an email's 600px), not a breakpoint view's.
      const mode = locked ? { kind: "width" as const, target: locked, offset: 48, max: 1 } : fitModeFor(view, canvas.device, bp, phone);
      if (r.width > 0) run("canvas.zoomFitApply", { zoom: fitZoom(mode, r.width, r.height) });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, view, canvas.device, run, bp, phone, locked]);

  const width = locked ?? viewWidth(view, canvas.widthOverride, bp);
  const frameSpec = !locked && canvas.device && view !== "desktop" ? deviceFrame(view, bp, phone) : null;
  const scoped = !preview && !locked;
  const zoomStyle = { zoom, "--device-zoom-inverse": String(1 / (zoom || 1)) } as CSSProperties;
  const onRendered = (frame: HTMLIFrameElement, doc: Document, version: number) => setInfo({ frame, doc, version, host: host.current });

  // Live preview: a separate sandboxed frame runs the site's scripts; the inert canvas stays mounted (hidden) so
  // leaving is instant and the editor's own frame never runs them.
  const canLive = !!canvasHost?.previewUrl && !locked;
  const live = preview && liveOn && canLive;
  const frameClass = frameSpec ? frameSpec.radius.inner : "";
  const frameStyle: CSSProperties = frameSpec ? { width: frameSpec.innerWidth, height: frameSpec.innerHeight } : { minHeight: "100%" };
  const frameEl = <CanvasFrame onRendered={onRendered} className={frameClass} style={live ? { ...frameStyle, display: "none" } : frameStyle} />;

  return (
    <div ref={root} data-slot="Canvas" data-view={view} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {scoped && <ScopeBand view={view} multiScope={multiScope} bp={bp} />}
      {scoped && <ScopeCoachmark view={view} />}
      <div className="flex min-h-0 flex-1 flex-row">
      <div id="viewport" data-viewport="" className={`scrollbar relative min-h-0 flex-1 overflow-x-hidden ${frameSpec ? "overflow-y-auto" : "overflow-y-hidden"} ${width != null ? "bg-neutral/50" : ""}`}>
        <CanvasFrameContext.Provider value={info}>
          <div ref={host} data-canvas-host="" className="relative mx-auto h-full" style={frameSpec ? undefined : canvasBoxStyle(width, canvas.responsive, zoom)}>
            {/* one nesting for both modes, so switching device frames never remounts the iframe */}
            {frameSpec && !preview && <DeviceHeader frame={frameSpec} />}
            <div data-canvas-box={frameSpec ? undefined : ""} className={frameSpec ? `relative mx-auto w-fit ${preview ? "pt-16" : ""}` : "relative h-full"} style={frameSpec ? undefined : zoomStyle}>
              <div ref={setFrameBox} className={frameSpec ? "relative" : "contents"}>
                <div
                  data-device-frame={frameSpec?.kind}
                  className={frameSpec ? `relative mx-auto flex shrink-0 overflow-hidden border-[3px] border-[#2a2a2a] bg-[#1a1a1a] shadow-xl ${frameSpec.radius.outer}` : "contents"}
                  style={frameSpec ? { ...zoomStyle, padding: `${frameSpec.padding.top}px ${frameSpec.padding.right}px ${frameSpec.padding.bottom}px ${frameSpec.padding.left}px` } : undefined}
                >
                  {frameEl}
                  {live && <LivePreviewFrame className={frameClass} style={frameStyle} />}
                </div>
                {frameSpec && !live && <DeviceScrollbar frameBox={frameBox} doc={info.doc} version={info.version} />}
              </div>
            </div>
            {scoped && width != null && !frameSpec && <EdgeHandles width={width} zoom={zoom} />}
            {scoped && canvas.markers && !frameSpec && <BreakpointMarkers zoom={zoom} />}
            {/* The overlay layer is click-through; every interactive leaf (handles, chips, the text toolbar) opts back in with `pointer-events-auto`. A blanket `[&>*]:pointer-events-auto` here instead forced the full-size passthrough wrappers (CanvasOverlays, NodeTools) to swallow every canvas click. */}
            {!preview && (
              <div data-canvas-overlays="" className="pointer-events-none absolute inset-0 z-30">
                <Slot name="CanvasOverlays" />
                <Slot name="NodeTools" />
                <Slot name="InlineTextToolbar" />
                <CanvasDnd />
              </div>
            )}
          </div>
          {canvas.guides && <DeviceGuides zoom={zoom} />}
        </CanvasFrameContext.Provider>
      </div>
      {canvas.mirror && !canvas.device && !preview && <MirrorFrame view={canvas.mirror} main={info.doc} />}
      </div>
      {preview && <PreviewEditButton onExit={() => run("preview.exit")} before={canLive ? <LivePreviewToggle on={liveOn} /> : null} />}
    </div>
  );
}
