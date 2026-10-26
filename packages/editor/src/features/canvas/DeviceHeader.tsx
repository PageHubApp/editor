// The bar floating above a device frame, and the frame's external scrollbar.
/**
 * The bar floating above a device frame, and the frame's external scrollbar.
 * - Phones: the model dropdown (17 presets, "Custom" last), editable W × H (typing switches to
 *   Custom), exit ✕. Tablets / laptops / monitors: kind, dimensions, exit. Then the zoom control.
 * - Scrollbar: a 6px track 10px right of the frame at 80% of its height, thumb ≥ 30px and
 *   draggable (window listeners); hidden when the page doesn't scroll.
 */
import { useEffect, useRef, useState } from "react";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { ListboxPopover } from "../../primitives/ListboxPopover";
import { tooltip } from "../../primitives/tooltip";
import { Icon } from "../../primitives/icons";
import { useDragGesture } from "../../primitives/useDragGesture";
import { ZoomControl } from "./BreakpointSwitcher";
import { canvasOf } from "./canvasState";
import { DEVICE_PRESETS, rotatedPreset, type DeviceFrame } from "./viewportMath";

export const SCROLLBAR_GAP = 10;
const THUMB_MIN = 30;

function PhoneSelector({ onExit }: { onExit(): void }) {
  const run = useRunCommand();
  const phone = useEditorState((s) => canvasOf(s).phone);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const custom = (patch: { width?: number; height?: number }) => run("canvas.set", { phone: { ...phone, ...patch, name: "Custom" } });
  const num = (v: string) => Math.max(0, parseInt(v, 10) || 0);
  return (
    <div className="flex items-center gap-3 text-xs" data-device-selector="">
      <div ref={box} className="relative">
        <button type="button" data-device-preset-trigger="" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="hover:text-neutral-content flex items-center gap-1 transition-colors">
          <span className="whitespace-nowrap">{phone.name}</span>
          <Icon name="chevron-down" className="size-3" />
        </button>
        <ListboxPopover open={open} onOpenChange={setOpen} anchor={box} maxHeight={384} dismiss ariaLabel="Devices" marker="data-device-presets" surface="border-base-300 bg-neutral text-neutral-content rounded-xl border" className="scrollbar w-56">
          {DEVICE_PRESETS.map((d) => (
            <li key={d.name} role="none">
              <button type="button" role="option" aria-selected={phone.name === d.name} data-device-preset={d.name} onClick={() => (run("canvas.set", { phone: phone.landscape ? rotatedPreset(d) : d }), setOpen(false))} className={`w-full px-4 py-2 text-left transition-colors hover:bg-white/10 ${phone.name === d.name ? "bg-white/10" : ""}`}>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs opacity-70">
                  {d.width} × {d.height} • {d.dpr}x DPR
                </div>
              </button>
            </li>
          ))}
        </ListboxPopover>
      </div>
      <div className="flex items-center gap-1">
        <input type="number" aria-label="Device width" data-device-width="" value={phone.width} onChange={(e) => custom({ width: num(e.target.value) })} className="w-12 bg-transparent text-center focus:outline-none" placeholder="W" />
        <span>×</span>
        <input type="number" aria-label="Device height" data-device-height="" value={phone.height} onChange={(e) => custom({ height: num(e.target.value) })} className="w-12 bg-transparent text-center focus:outline-none" placeholder="H" />
      </div>
      <button type="button" aria-label={phone.landscape ? "Rotate to portrait" : "Rotate to landscape"} aria-pressed={!!phone.landscape} data-device-rotate="" onClick={() => run("canvas.set", { phone: rotatedPreset(phone) })} {...tooltip(phone.landscape ? "Rotate to portrait" : "Rotate to landscape", "bottom")} className="transition-colors hover:opacity-80">
        <Icon name="rotate" className="size-4" />
      </button>
      <button type="button" aria-label="Exit device mode" data-device-exit="" onClick={onExit} {...tooltip("Exit device mode")} className="transition-colors hover:opacity-80">
        <Icon name="x" className="size-4" />
      </button>
    </div>
  );
}

export function DeviceHeader({ frame }: { frame: DeviceFrame }) {
  const run = useRunCommand();
  const exit = () => run("canvas.toggleDevice");
  return (
    <div data-device-header="" className="relative z-50 flex min-h-16 justify-center px-2 pt-4 pb-2">
      <div className="bg-neutral/95 text-neutral-content flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-xl px-4 py-2 shadow-lg backdrop-blur-sm">
        {frame.kind === "phone" ? (
          <PhoneSelector onExit={exit} />
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium capitalize">{frame.kind}</span>
            <span className="opacity-70">
              {frame.innerWidth} × {frame.innerHeight}
            </span>
            <button type="button" aria-label="Exit device mode" data-device-exit="" onClick={exit} {...tooltip("Exit device mode")} className="ml-2 transition-colors hover:opacity-80">
              <Icon name="x" className="size-4" />
            </button>
          </div>
        )}
        <div className="h-4 w-px bg-current opacity-30" />
        <ZoomControl />
      </div>
    </div>
  );
}

/** Thumb size and offset for a scroll box (null: nothing scrolls). */
export function thumbFor(scrollTop: number, scrollHeight: number, clientHeight: number, track: number): { size: number; top: number } | null {
  if (scrollHeight <= clientHeight || track <= 0) return null;
  const size = Math.max(THUMB_MIN, (clientHeight / scrollHeight) * track);
  return { size, top: (scrollTop / (scrollHeight - clientHeight)) * (track - size) };
}

/** The page's scroll box inside the device frame. */
const scrollerOf = (doc: Document | null) => (doc?.scrollingElement ?? doc?.documentElement ?? null) as HTMLElement | null;

export function DeviceScrollbar({ frameBox, doc, version }: { frameBox: HTMLElement | null; doc: Document | null; version: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ size: number; top: number } | null>(null);
  const start = useRef(0);
  useEffect(() => {
    const el = scrollerOf(doc);
    if (!el || !frameBox) return;
    const sync = () => {
      const h = frameBox.getBoundingClientRect().height * 0.8;
      setThumb(thumbFor(el.scrollTop, el.scrollHeight, el.clientHeight, h));
    };
    sync();
    const win = doc!.defaultView;
    win?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      win?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [doc, version, frameBox]);
  const { onPointerDown } = useDragGesture({
    onStart: () => void (start.current = thumb?.top ?? 0),
    onMove: (_e, m) => {
      const el = scrollerOf(doc);
      const h = track.current?.getBoundingClientRect().height ?? 0;
      if (!el || !thumb) return;
      const range = h - thumb.size;
      if (range <= 0) return;
      const top = Math.max(0, Math.min(range, start.current + m.dy));
      el.scrollTop = (top / range) * (el.scrollHeight - el.clientHeight);
      setThumb({ ...thumb, top });
    },
  });
  if (!thumb) return null;
  return (
    <div ref={track} data-device-scrollbar="" className="absolute top-[10%] h-[80%] w-1.5 rounded-full bg-current/15" style={{ left: `calc(100% + ${SCROLLBAR_GAP}px)` }}>
      <div role="presentation" aria-hidden data-device-thumb="" onPointerDown={onPointerDown} className="absolute left-0 w-full cursor-grab touch-none rounded-full bg-current/50 hover:bg-current/80 active:cursor-grabbing" style={{ height: thumb.size, top: thumb.top }} />
    </div>
  );
}
