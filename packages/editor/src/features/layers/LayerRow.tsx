/**
 * One row of the layers tree: chevron (rows with children; rotates 90° over 150ms; doesn't
 * select), type icon in its role colour, the label (double-click renames, except the page row),
 * the lint dot, the resting eye-off on a hidden row, and the action strip (eye, ↑ ↓ ← →, trash)
 * — always on the selected row, else on hover. Indent `depth*12+6`px; a hidden, unselected row
 * is at 60%. Drop feedback: a line before / after indented to the row, or the inside ring.
 * Rename keeps a draft: Enter and blur commit it (one write), Escape cancels.
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { tooltip } from "../../primitives/tooltip";
import { Icon, type IconName } from "../../primitives/icons";
import { CLOSE_ON_CANVAS, OPEN_ON_CANVAS } from "../canvas/overlayPreview";
import type { RowMove } from "./layersKit";

const ROW_SELECTED = "bg-blue-600 text-white dark:bg-blue-500";
const ROW_IDLE = "text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800/70";
const ROW_HOVERED = "bg-gray-100 dark:bg-gray-800/70";
const DROP_INSIDE = "ring-1 ring-blue-500 ring-inset";
const ICON_SELECTED = "text-white";
const ICON_MUTED = "text-gray-500 dark:text-gray-400";
const RENAME_INPUT = "w-full rounded border border-blue-500 bg-white px-0.5 py-0 text-xs leading-none text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100";
const ACTION = "rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10";

export type RowKind = "page" | "header" | "footer" | "section" | null;

const ROLE_ICON: Record<Exclude<RowKind, null>, { glyph: IconName; color: string }> = {
  page: { glyph: "file", color: "text-orange-500" },
  header: { glyph: "layout-navbar", color: "text-purple-500" },
  footer: { glyph: "layout-bottombar", color: "text-emerald-500" },
  section: { glyph: "section", color: "text-blue-500" },
};

const GLOBAL_ICON = { glyph: "world", color: "text-amber-500" } as const;
const GLOBAL_TIP = "Sits outside the page, so it shows on every page. Edit it once and it changes everywhere.";

const MOVES: { move: RowMove; glyph: IconName; label: string }[] = [
  { move: "up", glyph: "arrow-up", label: "Move up" },
  { move: "down", glyph: "arrow-down", label: "Move down" },
  { move: "out", glyph: "arrow-left", label: "Move out" },
  { move: "in", glyph: "arrow-right", label: "Move in" },
];

/** Connector-line style (inline: it must read on both the idle and the selected row, in either theme). */
const GUIDE = { color: "inherit" } as const;
const GUIDE_LINE = "1px solid color-mix(in srgb, currentColor 35%, transparent)";

interface LayerPathRowProps {
  label: string;
  kind: RowKind;
  glyph: IconName;
  /** 0 = the page row; each level indents 12px and joins its parent with a connector line. */
  depth: number;
  /** The element the path ends at: highlighted like a selected layer, not clickable. */
  current?: boolean;
  global?: boolean;
  hovered?: boolean;
  /** A row follows: draw the line down to it. */
  joinsChild?: boolean;
  onSelect?(): void;
  onHover?(on: boolean): void;
  onContextMenu?(e: MouseEvent): void;
}

/**
 * A layers-tree row for a single ancestor path (the ancestors menu): the same role icons, colours,
 * indent, type scale and row height as `LayerRow`, minus the toggle / actions / drag, plus the
 * connector line to its parent.
 */
export function LayerPathRow(p: LayerPathRowProps) {
  const role = p.global ? GLOBAL_ICON : p.kind ? ROLE_ICON[p.kind] : null;
  const indent = p.depth * 12 + 6;
  const Tag = p.current ? "div" : "button";
  return (
    <Tag
      {...(p.current ? { "aria-current": "true" as const } : { type: "button" as const, onClick: p.onSelect, onContextMenu: p.onContextMenu })}
      role="menuitem"
      data-layer-row=""
      data-path-row={p.depth}
      data-selected={p.current ? "" : undefined}
      className={["relative flex w-full select-none items-center gap-1 py-1.5 pr-3 text-left", p.current ? `${ROW_SELECTED} cursor-default` : `cursor-pointer ${p.hovered ? ROW_HOVERED : ROW_IDLE}`].join(" ")}
      style={{ paddingLeft: indent }}
      onMouseEnter={() => p.onHover?.(true)}
      onMouseLeave={() => p.onHover?.(false)}
    >
      {p.joinsChild && <span aria-hidden className="pointer-events-none absolute" style={{ ...GUIDE, left: p.depth * 12 + 13, top: "70%", bottom: 0, borderLeft: GUIDE_LINE }} />}
      {p.depth > 0 && <span data-path-connector="" aria-hidden className="pointer-events-none absolute" style={{ ...GUIDE, left: (p.depth - 1) * 12 + 13, top: 0, height: "50%", width: 6, borderLeft: GUIDE_LINE, borderBottom: GUIDE_LINE, borderBottomLeftRadius: 3 }} />}
      <span data-layer-icon={role?.glyph ?? p.glyph} className={`shrink-0 ${p.current ? ICON_SELECTED : (role?.color ?? ICON_MUTED)}`}>
        <Icon name={role?.glyph ?? p.glyph} className="size-3.5" />
      </span>
      <span data-layer-label="" className={`block truncate text-xs leading-tight ${p.current ? "font-medium" : ""}`}>
        {p.label}
      </span>
    </Tag>
  );
}

interface LayerRowProps {
  label: string;
  kind: RowKind;
  /** Element icon (non-role rows). */
  glyph: IconName;
  depth: number;
  selected: boolean;
  hovered: boolean;
  hidden: boolean;
  /** A layout-level section: it shows on every page (amber world icon). */
  global?: boolean;
  expandable: boolean;
  expanded: boolean;
  /** Lint messages on this element; the dot is red with any error. */
  lint?: { error: boolean; messages: readonly string[] } | null;
  drop?: "before" | "after" | "inside" | null;
  /** Depth the drop line is indented to (default the row's). */
  dropDepth?: number;
  canMove: Record<RowMove, boolean>;
  canDelete: boolean;
  /** The drag props from `useLayerDrag().row()`. */
  drag?: { ref(el: HTMLElement | null): void; style?: CSSProperties; onPointerDown(e: ReactPointerEvent): void; [k: `data-${string}`]: string | undefined };
  onSelect(): void;
  /** The pointer entered the row. */
  onHover?(): void;
  onToggle(): void;
  onRename?(name: string): void;
  onToggleHidden?(): void;
  /** On a popover / dialog, or its trigger: show it on the canvas (preview only) and hide it again. */
  overlay?: { open: boolean; onToggle(): void };
  onMove(move: RowMove): void;
  onDelete(): void;
  onContextMenu?(e: MouseEvent): void;
}

const stop = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  fn();
};

export function LayerRow(p: LayerRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (draft !== null) {
      input.current?.focus();
      input.current?.select();
    }
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (draft !== null && draft !== p.label) p.onRename?.(draft);
    setDraft(null);
  };
  const role = p.global ? GLOBAL_ICON : p.kind ? ROLE_ICON[p.kind] : null;
  const iconColor = p.selected ? ICON_SELECTED : (role?.color ?? ICON_MUTED);
  const indent = p.depth * 12 + 6;
  const line = (where: "before" | "after") => (
    <div data-layer-drop-line={where} className="pointer-events-none absolute right-0 h-0.5 bg-blue-500" style={{ left: (p.dropDepth ?? p.depth) * 12 + 6, [where === "before" ? "top" : "bottom"]: -1 }} />
  );
  const { ref, style, ...drag } = p.drag ?? { ref: undefined };
  return (
    <div
      {...drag}
      ref={ref as Ref<HTMLDivElement> | undefined}
      data-layer-row=""
      onPointerEnter={p.onHover}
      data-layer-kind={p.kind ?? undefined}
      data-selected={p.selected ? "" : undefined}
      data-hovered={p.hovered && !p.selected ? "" : undefined}
      role="treeitem"
      aria-selected={p.selected}
      aria-expanded={p.expandable ? p.expanded : undefined}
      aria-level={p.depth + 1}
      className={[
        "group relative flex w-full cursor-pointer select-none items-center gap-1 py-1.5 pr-1.5",
        p.kind === "header" ? "mb-0.5" : "",
        p.kind === "footer" ? "mt-0.5" : "",
        p.selected ? ROW_SELECTED : ROW_IDLE,
        p.hovered && !p.selected ? ROW_HOVERED : "",
        p.drag?.["data-dragging"] !== undefined ? "cursor-grabbing" : "",
        p.drop === "inside" ? DROP_INSIDE : "",
        p.hidden && !p.selected ? "opacity-60" : "",
      ].filter(Boolean).join(" ")}
      style={{ paddingLeft: indent, ...style }}
      onClick={p.onSelect}
      onContextMenu={p.onContextMenu}
    >
      {p.drop === "before" && line("before")}
      <div className="flex size-3 shrink-0 items-center justify-center">
        {p.expandable && (
          <button type="button" data-layer-toggle="" onClick={stop(p.onToggle)} onPointerDown={(e) => e.stopPropagation()} className="rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10" aria-expanded={p.expanded} aria-label={p.expanded ? "Collapse" : "Expand"}>
            <span className={`block transition-transform duration-150 ${p.expanded ? "rotate-90" : ""} ${p.selected ? ICON_SELECTED : ICON_MUTED}`}>
              <Icon name="chevron-right" className="size-3" />
            </span>
          </button>
        )}
      </div>
      <span data-layer-icon={role?.glyph ?? p.glyph} className={`shrink-0 ${iconColor}`} {...(p.global ? tooltip(GLOBAL_TIP, "right") : {})}>
        <Icon name={role?.glyph ?? p.glyph} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1" onDoubleClick={p.kind === "page" || !p.onRename ? undefined : stop(() => setDraft(p.label))}>
        {draft !== null ? (
          <input
            ref={input}
            type="text"
            data-layer-rename=""
            aria-label="Layer name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setDraft(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={RENAME_INPUT}
          />
        ) : (
          <span data-layer-label="" className={`block truncate text-xs leading-tight ${p.selected ? "font-medium" : ""}`}>
            {p.kind === "page" ? "Page" : p.label}
          </span>
        )}
      </div>
      {p.lint && (
        <span
          data-layer-lint={p.lint.error ? "error" : "warning"}
          className={`size-1.5 shrink-0 rounded-full ${p.lint.error ? "bg-red-500" : "bg-yellow-500"}`}
          {...tooltip(p.lint.messages.map((m) => `• ${m}`).join("\n"), "left")}
          aria-label={`${p.lint.messages.length} ${p.lint.messages.length === 1 ? "issue" : "issues"}`}
        />
      )}
      {p.hidden && !p.selected && (
        <span data-layer-hidden="" className="shrink-0 text-gray-400 group-hover:hidden dark:text-gray-500">
          <Icon name="eye-off" className="size-3.5" />
        </span>
      )}
      {p.kind !== "page" && (
        <div data-layer-actions="" className={`flex items-center gap-0.5 transition-opacity ${p.selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onPointerDown={(e) => e.stopPropagation()}>
          {p.onToggleHidden && (
            <button type="button" data-layer-action="visibility" onClick={stop(p.onToggleHidden)} className={ACTION} {...tooltip(p.hidden ? "Show" : "Hide")} aria-label="Toggle visibility" aria-pressed={!p.hidden}>
              <Icon name={p.hidden ? "eye-off" : "eye"} className="size-3.5" />
            </button>
          )}
          {p.overlay && (
            <button type="button" data-layer-action="overlay" onClick={stop(p.overlay.onToggle)} className={ACTION} {...tooltip(`${p.overlay.open ? CLOSE_ON_CANVAS : OPEN_ON_CANVAS}. Preview only: the saved page is unchanged.`)} aria-label={p.overlay.open ? CLOSE_ON_CANVAS : OPEN_ON_CANVAS} aria-pressed={p.overlay.open}>
              <Icon name="layout-sidebar-right" className="size-3.5" />
            </button>
          )}
          {MOVES.map(({ move, glyph, label }) => (
            <button key={move} type="button" data-layer-action={move} disabled={!p.canMove[move]} onClick={stop(() => p.onMove(move))} className={`${ACTION} ${p.canMove[move] ? "" : "cursor-not-allowed opacity-30"}`} {...tooltip(label)} aria-label={label}>
              <Icon name={glyph} className="size-3" />
            </button>
          ))}
          {p.canDelete && (
            <button type="button" data-layer-action="delete" onClick={stop(p.onDelete)} className="rounded p-0.5 transition-colors hover:bg-red-500/20 hover:text-red-500" {...tooltip("Delete")} aria-label="Delete">
              <Icon name="trash" className="size-3" />
            </button>
          )}
        </div>
      )}
      {p.drop === "after" && line("after")}
    </div>
  );
}
