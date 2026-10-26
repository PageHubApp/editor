/**
 * The layer tree of the page the canvas shows: a "Page" row, then its elements and Liquid blocks.
 * Expand state lives in the panel (only the page open on mount, nothing persisted); a selection
 * from anywhere expands every ancestor and never collapses anything. Click selects (the page
 * row shows that page), canvas hover lights the matching row, right-click selects and opens the
 * editor's context menu. Keys on the focused tree: ↑ / ↓ select the previous / next visible row,
 * → expands (or steps into the first child), ← collapses (or steps out to the parent).
 * Rows drag through `useLayerDrag`.
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Diagnostic, NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { canvasOf, canvasPage } from "../canvas/canvasState";
import { mainCanvasDoc, previewTargetFor, isPreviewOpen, togglePreviewTarget } from "../canvas/overlayPreview";
import { useRenderStatus } from "../canvas/renderStatus";
import { useLayerDrag } from "../dnd/useLayerDrag";
import { LayerRow, type RowKind } from "./LayerRow";
import { glyphFor } from "./glyphs";
import { canMoveRow, type RowMove, canRemove, isGlobalSection, isHidden, isSealed, moveRow, rowChildren, rowIcon, rowLabel, rowRole, topRows } from "./layersKit";

interface Row {
  h: NodeHandle;
  depth: number;
  hasChildren: boolean;
}

/** The visible rows (depth 1 = top level; the page row is depth 0). */
function flatten(top: NodeHandle[], open: ReadonlySet<NodeHandle>): Row[] {
  const out: Row[] = [];
  const walk = (list: NodeHandle[], depth: number) => {
    for (const h of list) {
      const kids = isSealed(h) ? [] : rowChildren(h);
      out.push({ h, depth, hasChildren: kids.length > 0 });
      if (kids.length && open.has(h)) walk(kids, depth + 1);
    }
  };
  walk(top, 1);
  return out;
}

const MOVES: readonly RowMove[] = ["up", "down", "out", "in"];

const keys = new WeakMap<NodeHandle, number>();
let nextKey = 0;
/** A React key that follows the handle through edits (handles remap; offsets don't). */
const keyOf = (h: NodeHandle): number => keys.get(h) ?? (keys.set(h, ++nextKey), nextKey);

const diagnosticsOf = (store: object): readonly Diagnostic[] => (store as { diagnostics?: readonly Diagnostic[] }).diagnostics ?? [];

export function LayerTree() {
  const store = useEditorStore();
  const files = useEditorState((s) => s.files);
  const page = useEditorState((s) => canvasPage(s));
  const selected = useEditorState((s) => s.selection.primary);
  const hover = useEditorState((s) => s.selection.hover);
  // rows re-read their preview state when an overlay opens or a state preview is applied
  useEditorState((s) => canvasOf(s).openOverlays);
  useEditorState((s) => canvasOf(s).statePreview);
  useRenderStatus(store); // rows re-resolve their popover / dialog targets after the canvas paints
  const [pageOpen, setPageOpen] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<NodeHandle>>(() => new Set());
  /** The row under the pointer: with the selected row, the only ones whose arrows are asked the dry-run `element.move`. */
  const [armed, setArmed] = useState<NodeHandle | null>(null);
  const { row, indicator } = useLayerDrag();

  useEffect(() => {
    if (!selected?.alive || selected.path !== page) return;
    const up: NodeHandle[] = [];
    for (let p = selected.parent(); p; p = p.parent()) up.push(p);
    setPageOpen(true);
    if (up.some((p) => !open.has(p))) setOpen(new Set([...open, ...up]));
  }, [selected, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (page && pageOpen ? flatten(topRows(store, page), open) : []), [store, files, page, pageOpen, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const lint = useMemo(() => {
    const by = new Map<number, Diagnostic[]>();
    for (const d of diagnosticsOf(store)) if (d.path === page) by.set(d.range.start, [...(by.get(d.range.start) ?? []), d]);
    return by;
  }, [store, files, page]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!page) return null;
  const toggle = (h: NodeHandle) => {
    const next = new Set(open);
    if (!next.delete(h)) next.add(h);
    setOpen(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const i = rows.findIndex((r) => r.h === selected);
    const cur = rows[i];
    let next: NodeHandle | null | undefined;
    if (e.key === "ArrowDown") next = rows[i + 1]?.h ?? (i < 0 ? rows[0]?.h : undefined);
    else if (e.key === "ArrowUp") next = i > 0 ? rows[i - 1]!.h : undefined;
    else if (e.key === "ArrowRight" && cur?.hasChildren) {
      if (!open.has(cur.h)) toggle(cur.h);
      else next = rowChildren(cur.h)[0];
    } else if (e.key === "ArrowLeft" && cur) {
      if (cur.hasChildren && open.has(cur.h)) toggle(cur.h);
      else next = cur.h.parent();
    } else return;
    e.preventDefault();
    if (next) store.select(next);
  };

  const kindOf = (h: NodeHandle): RowKind => rowRole(h);
  const overlayOf = (h: NodeHandle) => {
    const target = previewTargetFor(store, mainCanvasDoc(store), h);
    return target ? { open: isPreviewOpen(store.state, target), onToggle: () => togglePreviewTarget(store, target) } : undefined;
  };
  return (
    <div role="tree" aria-label="Layers" tabIndex={0} data-layer-tree="" onKeyDown={onKeyDown} className="inline-block min-w-full outline-none">
      <LayerRow
        label="Page"
        kind="page"
        glyph="file"
        depth={0}
        selected={false}
        hovered={false}
        hidden={false}
        expandable={topRows(store, page).length > 0}
        expanded={pageOpen}
        canMove={{ up: false, down: false, out: false, in: false }}
        canDelete={false}
        onSelect={() => store.run("canvas.set", { page })}
        onToggle={() => setPageOpen(!pageOpen)}
        onMove={() => {}}
        onDelete={() => {}}
      />
      {rows.map(({ h, depth, hasChildren }) => {
        const issues = lint.get(h.range.from);
        const target = indicator && indicator.target === h ? indicator : null;
        return (
          <LayerRow
            key={keyOf(h)}
            label={rowLabel(h)}
            kind={kindOf(h)}
            glyph={glyphFor(rowIcon(h))}
            depth={depth}
            selected={selected === h}
            hovered={hover === h}
            hidden={isHidden(h)}
            global={isGlobalSection(h)}
            expandable={hasChildren}
            expanded={open.has(h)}
            lint={issues ? { error: issues.some((d) => d.severity === "error"), messages: issues.map((d) => d.message) } : null}
            drop={target ? (target.zone === "inside" ? "inside" : target.zone === "before" ? "before" : "after") : null}
            dropDepth={target?.depth}
            canMove={MOVES.reduce((m, k) => ({ ...m, [k]: canMoveRow(store, h, k, selected === h || armed === h) }), {} as Record<RowMove, boolean>)}
            onHover={() => setArmed(h)}
            canDelete={canRemove(h)}
            drag={row(h, depth)}
            onSelect={() => store.select(h)}
            onToggle={() => toggle(h)}
            onRename={h.kind === "element" ? (name) => store.run("attr.set", { name: "data-edit-name", value: name.trim() || null, at: h }) : undefined}
            onToggleHidden={h.kind === "element" ? () => store.run("layers.toggleHidden", { at: h }) : undefined}
            overlay={overlayOf(h)}
            onMove={(m) => moveRow(store, h, m)}
            onDelete={() => store.run("layers.remove", { at: h })}
            onContextMenu={(e) => {
              e.preventDefault();
              store.select(h);
              store.run("contextMenu.open", { x: e.clientX, y: e.clientY });
            }}
          />
        );
      })}
    </div>
  );
}
