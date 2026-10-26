// Chips drawn over the selection; positions come from the canvas.
/**
 * The default `CanvasOverlays` slot: chips drawn over the selection — the editable name chip
 * (media, embeds and form fields), "repeated ×N" on a `{% for %}` row, the include ring with
 * "Edit <name>", the condition badge — a lint dot on every element with issues, and the Alt-held distance lines.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Diagnostic, NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { nodeName } from "../../state/nodeName";
import { AncestorsMenu, crumbsOf } from "./AncestorsMenu";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useCanvasFrame } from "./canvasContext";
import { canvasOf } from "./canvasState";
import { elementsFor, hostRect, toRect, visibleInFrame } from "./frameDom";
import type { Rect } from "./geometry";
import { IncludeInAiButton } from "./NodeToolExtras";
import { MeasurementLines } from "./MeasurementLines";
import { CLOSE_ON_CANVAS, OPEN_ON_CANVAS, useOverlayPreview } from "./overlayPreview";
import { useKeepInView } from "./useKeepInView";
import { useSelectionGeometry } from "./useSelectionGeometry";

/** Tags that get the editable name chip (today's Embed, Video, Audio, FormElement). */
const NAME_CHIP_TAGS: Readonly<Record<string, string>> = { iframe: "Embed", embed: "Embed", video: "Video", audio: "Audio", input: "Field", select: "Field", textarea: "Field" };
export const RENAME_DEBOUNCE_MS = 500;
const CHIP = "ph-node-name-chip pointer-events-auto absolute z-40 rounded bg-base-100 px-2 text-xs text-base-content shadow-sm whitespace-nowrap";

/** Chip height used to decide whether a chip fits above its element. */
export const CHIP_ROOM = 20;

/** Elements that are page chrome, not a selectable page background (`<html>` / `<body>`). */
const PAGE_LEVEL = new Set(["html", "body"]);

/**
 * The page's top-level element — the HTML-first "Background": the first real element under
 * `<body>`, so the whole page canvas. It carries the page name chip at bottom / end and the
 * hover chip at top / start.
 */
export function isPageBackground(h: NodeHandle): boolean {
  if (h.kind !== "element" || PAGE_LEVEL.has(h.tag)) return false;
  for (let p = h.parent(); p; p = p.parent()) if (p.kind === "element" && !PAGE_LEVEL.has(p.tag)) return false;
  return true;
}

type ChipPlace = "top-start" | "top-end" | "bottom-end";

/**
 * A chip 2px outside the element's edge; when the top edge would be clipped by the top of the
 * canvas it moves inside instead. The bottom-end variant (the Background name chip) pins to the
 * visible bottom — the element's own bottom, or the canvas foot `clamp` when the page runs past it
 * — so a full-page background still shows its chip.
 */
export const at = (r: Rect, place: ChipPlace, clamp?: number): CSSProperties => {
  if (place === "bottom-end") {
    const bottom = clamp != null ? Math.min(r.bottom, clamp) : r.bottom;
    return { left: r.right, top: bottom - 2, transform: "translate(-100%, -100%)" };
  }
  const inside = r.top < CHIP_ROOM;
  const top = inside ? r.top + 2 : r.top - 2;
  const y = inside ? "0" : "-100%";
  return place === "top-start" ? { left: r.left, top, transform: `translateY(${y})` } : { left: r.right, top, transform: `translate(-100%, ${y})` };
};

/** On a selected `<details>` / `<summary>`: previews it closed / open in the canvas only (also Alt-click on the summary). */
function DetailsPreviewToggle({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const details = handle.tag === "details" ? handle : handle.tag === "summary" ? handle.parent() : null;
  const src = details?.alive && details.kind === "element" ? editSrcOf(details) : null;
  const closed = useEditorState((s) => !!src && canvasOf(s).closedDetails.includes(src));
  if (!src) return null;
  const label = closed ? "Show open" : "Show closed";
  return (
    <button type="button" data-details-preview={closed ? "closed" : "open"} aria-label={label} aria-pressed={closed} className="hover:bg-base-200 flex size-4 items-center justify-center rounded" {...tooltip(`${label} (Alt-click the summary). Preview only: the saved page is unchanged.`, "bottom")} onClick={() => run("canvas.toggleDetails", { src })}>
      <Icon name={closed ? "chevron-right" : "chevron-down"} className="size-3" />
    </button>
  );
}

/**
 * On a selected `[popover]` / `<dialog>`, or any trigger that points at one or runs a state action (open, toggle,
 * hide, close): shows the target on the canvas so its contents can be selected and edited, and hides it again.
 * Preview only, like the details toggle.
 */
function OverlayPreviewToggle({ handle }: { handle: NodeHandle }) {
  const { doc } = useCanvasFrame();
  const { src, open, toggle } = useOverlayPreview(doc, handle);
  if (!src) return null;
  const label = open ? CLOSE_ON_CANVAS : OPEN_ON_CANVAS;
  return (
    <button type="button" data-overlay-preview={open ? "open" : "closed"} aria-label={label} aria-pressed={open} className="hover:bg-base-200 flex size-4 items-center justify-center rounded" {...tooltip(`${label}. Preview only: the saved page is unchanged.`, "bottom")} onClick={toggle}>
      <Icon name="layout-sidebar-right" className="size-3" />
    </button>
  );
}

function NameChip({ handle, rect, place = "top-end", clamp }: { handle: NodeHandle; rect: Rect; place?: ChipPlace; clamp?: number }) {
  const run = useRunCommand();
  const name = useEditorState(() => (handle.alive ? (handle.attr("data-edit-name") ?? null) : null));
  const label = name ?? NAME_CHIP_TAGS[handle.tag] ?? nodeName(handle);
  const [editing, setEditing] = useState(false);
  const el = useRef<HTMLSpanElement>(null);
  const keep = useKeepInView<HTMLSpanElement>(rect);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const write = () => {
    clearTimeout(timer.current);
    const v = el.current?.textContent?.trim() ?? "";
    if (handle.alive) run("attr.set", { name: "data-edit-name", value: v || null, at: handle });
  };
  useEffect(() => {
    if (!editing || !el.current) return;
    el.current.focus();
    const sel = el.current.ownerDocument.getSelection();
    sel?.selectAllChildren(el.current);
  }, [editing]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hasParent = useEditorState(() => handle.alive && crumbsOf(handle).length > 1);
  return (
    <span ref={keep} data-name-tag="" className={`${CHIP} inline-flex items-center gap-0.5`} style={{ ...at(rect, place, clamp), zoom: "var(--device-zoom-inverse)" }}>
      <span
        ref={el}
        data-name-chip=""
        role="button"
        tabIndex={0}
        aria-label={`Rename ${label}`}
        contentEditable={editing}
        suppressContentEditableWarning
        className="cursor-text"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (!editing && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setEditing(true);
          } else if (editing && (e.key === "Enter" || e.key === "Escape")) {
            e.preventDefault();
            e.stopPropagation(); // Escape ends the rename, it doesn't also clear the selection
            (e.currentTarget as HTMLElement).blur();
          }
        }}
        onInput={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(write, RENAME_DEBOUNCE_MS);
        }}
        onBlur={() => {
          if (!editing) return;
          write();
          setEditing(false);
        }}
      >
        {label}
      </span>
      <DetailsPreviewToggle handle={handle} />
      <OverlayPreviewToggle handle={handle} />
      <IncludeInAiButton className="hover:bg-base-200 flex size-4 items-center justify-center rounded disabled:opacity-40" iconClassName="size-3" />
      {hasParent && (
        <>
          <button type="button" data-select-parent="" aria-label="Select parent" className="hover:bg-base-200 flex size-4 items-center justify-center rounded" {...tooltip("Select parent (Esc)", "bottom")} onClick={() => run("element.selectParent")}>
            <Icon name="arrow-up" className="size-3" />
          </button>
          <AncestorsMenu node={handle} className="hover:bg-base-200 flex size-4 items-center justify-center rounded" />
        </>
      )}
    </span>
  );
}

function RepeatedChip({ count, rect }: { count: number; rect: Rect }) {
  const keep = useKeepInView<HTMLSpanElement>(rect);
  return (
    <span ref={keep} data-repeated={count} className={`${CHIP} bg-primary! text-primary-content!`} style={at(rect, "top-start")}>
      repeated ×{count}
    </span>
  );
}

function IncludeChip({ path, rect }: { path: string; rect: Rect }) {
  const run = useRunCommand();
  const keep = useKeepInView<HTMLButtonElement>(rect);
  return (
    <button ref={keep} type="button" data-edit-include={path} className={`${CHIP} cursor-pointer font-medium`} style={at(rect, "top-start")} onClick={() => run("canvas.editInclude", { path })}>
      Edit {path.replace(/^.*\/|\.liquid$/g, "")}
    </button>
  );
}

/** "Conditional" inside `{% if %}` / `{% unless %}` / `{% case %}`, "Hidden" with the `hidden` class; click toggles `hidden`. */
function ConditionBadge({ handle, rect }: { handle: NodeHandle; rect: Rect }) {
  const run = useRunCommand();
  const hidden = useEditorState(() => handle.alive && handle.classes().includes("hidden"));
  const keep = useKeepInView<HTMLButtonElement>(rect);
  let conditional = false;
  for (let p = handle.parent(); p; p = p.parent()) if (p.kind === "liquid-block" && ["if", "unless", "case"].includes(p.tag)) conditional = true;
  if (!hidden && !conditional) return null;
  return (
    <button
      ref={keep}
      type="button"
      data-condition-badge={hidden ? "hidden" : "conditional"}
      className={`pointer-events-auto absolute z-40 rounded px-1.5 text-[10px] font-semibold text-white ${hidden ? "bg-red-500" : "bg-amber-500"}`}
      style={at(rect, "top-start")}
      {...tooltip(hidden ? "Hidden — click to show" : "Shown only when its condition holds — click to hide")}
      onClick={() => run("classes.set", { group: "display", token: hidden ? null : "hidden", at: handle })}
    >
      {hidden ? "Hidden" : "Conditional"}
    </button>
  );
}

/**
 * A 12px dot at the element's top-left −6px: red for an error, yellow for warnings. Hovering it
 * lists the issues, each fixable one with a Fix button (`lint.fix`, one undo step).
 */
function LintDots() {
  const store = useEditorStore();
  const run = useRunCommand();
  const { doc, frame, host, version } = useCanvasFrame();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const diagnostics = useEditorState(() => ((store as { diagnostics?: readonly Diagnostic[] }).diagnostics ?? []));
  const [open, setOpen] = useState<string | null>(null);
  const keepCard = useKeepInView<HTMLDivElement>();
  if (!doc || !frame || !host || !version) return null;
  const bySrc = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    let h = store.handle(d.path, d.range.start);
    while (h && h.kind !== "element") h = h.parent();
    if (!h) continue;
    const key = editSrcOf(h);
    bySrc.set(key, [...(bySrc.get(key) ?? []), d]);
  }
  return (
    <>
      {[...bySrc].map(([src, list]) => {
        const el = elementsFor(doc, src)[0];
        if (!el) return null;
        const r = hostRect(toRect(el.getBoundingClientRect()), frame, host, zoom);
        if (!visibleInFrame(r, frame, host)) return null;
        const error = list.some((d) => d.severity === "error");
        return (
          <span key={src} className="pointer-events-auto absolute z-40" style={{ left: r.left - 6, top: r.top - 6 }} onMouseEnter={() => setOpen(src)} onMouseLeave={() => setOpen(null)}>
            <span data-lint-dot={error ? "error" : "warning"} aria-label={`${list.length} issue${list.length > 1 ? "s" : ""}`} className={`block size-3 rounded-full ring-2 ring-white ${error ? "bg-red-500" : "bg-yellow-400"}`} />
            {open === src && (
              <div ref={keepCard} role="tooltip" data-lint-card="" className="bg-base-100 text-base-content border-base-300 absolute top-4 left-0 z-50 w-64 rounded-lg border p-2 text-xs shadow-lg">
                {list.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    <span className="flex-1">{d.message}</span>
                    {d.fix && (
                      <button type="button" data-lint-fix={d.rule} className="btn btn-xs btn-ghost" onClick={() => run("lint.fix", { path: d.path, splices: d.fix!.splices })}>
                        Fix
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </span>
        );
      })}
    </>
  );
}

export function CanvasOverlays() {
  const g = useSelectionGeometry();
  const { host } = useCanvasFrame();
  const hostH = host?.getBoundingClientRect().height;
  return (
    <div data-slot="CanvasOverlays" className="pointer-events-none absolute inset-0">
      {g && g.elements.length > 1 && !g.include && (
        <RepeatedChip count={g.elements.length} rect={g.rect} />
      )}
      {g?.include && (
        <>
          <div data-include-ring="" className="pointer-events-none absolute z-30 rounded-sm outline-2 outline-dashed outline-blue-500" style={{ left: g.rect.left, top: g.rect.top, width: g.rect.width, height: g.rect.height }} />
          <IncludeChip path={g.include} rect={g.rect} />
        </>
      )}
      {g && !g.include && (NAME_CHIP_TAGS[g.handle.tag] || g.elements.length === 1) && (
        isPageBackground(g.handle) && !NAME_CHIP_TAGS[g.handle.tag] ? (
          <NameChip key={`bg-${editSrcOf(g.handle)}`} handle={g.handle} rect={g.rect} place="bottom-end" clamp={hostH} />
        ) : (
          <NameChip key={editSrcOf(g.handle)} handle={g.handle} rect={g.rect} place={NAME_CHIP_TAGS[g.handle.tag] ? "top-end" : "top-start"} />
        )
      )}
      {g && !g.include && <ConditionBadge handle={g.handle} rect={g.rect} />}
      <LintDots />
      <MeasurementLines />
    </div>
  );
}
