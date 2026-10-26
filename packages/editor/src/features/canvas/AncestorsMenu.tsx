/**
 * The ancestors menu: a ▾ button that lists the node's path as layers-tree rows (the page, each
 * ancestor outermost first, the node itself last — highlighted, not clickable) joined by connector
 * lines. Picking an ancestor selects it, hovering one lights it on the canvas, right-click opens
 * the canvas context menu for it. Opens on hover and on click. One component for the panel's
 * selection heading and the canvas name tag.
 *
 *   <AncestorsMenu node={primary} />
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { setHover, type NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { Icon } from "../../primitives/icons";
import { useOverlay } from "../../primitives/overlayStack";
import { tooltip } from "../../primitives/tooltip";
import { HOVER_CLOSE_MS } from "./BreakpointSwitcher";
import { glyphFor } from "../layers/glyphs";
import { LayerPathRow } from "../layers/LayerRow";
import { isGlobalSection, rowIcon, rowRole } from "../layers/layersKit";
import { canvasPage } from "./canvasState";
import { nodeName } from "../../state/nodeName";

const SKIPPED = new Set(["html", "body"]);

/** Ancestors (outermost first) plus the node, page-level nodes skipped. */
export function crumbsOf(h: NodeHandle | null): NodeHandle[] {
  const out: NodeHandle[] = [];
  for (let n = h; n; n = n.parent()) if (!(n.kind === "element" && SKIPPED.has(n.tag))) out.unshift(n);
  return out;
}

/** "Hero Title" under "Hero" → "Title". */
export function stripPrefix(name: string, parent: string | null): string {
  return parent && name.startsWith(`${parent} `) ? name.slice(parent.length + 1) : name;
}

/** A crumb's label: its friendly name without its parent's name prefix. */
export const crumbLabel = (crumbs: readonly NodeHandle[], i: number): string => stripPrefix(nodeName(crumbs[i]!), i > 0 ? nodeName(crumbs[i - 1]!) : null);

export function AncestorsMenu({ node, className = "btn btn-ghost btn-xs" }: { node: NodeHandle; className?: string }) {
  const store = useEditorStore();
  const run = useRunCommand();
  const page = useEditorState((s) => canvasPage(s));
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lit = (h: NodeHandle | null) => store.dispatch((tr) => tr.effect(setHover, h));
  const close = () => {
    setOpen(false);
    lit(null);
  };
  useOverlay({ id: "breadcrumb-ancestry", isOpen: open, onDismiss: close });
  useEffect(() => () => clearTimeout(timer.current), []);

  const crumbs = crumbsOf(node);
  if (crumbs.length < 2) return null;
  const hover = (on: boolean) => {
    clearTimeout(timer.current);
    if (on) setOpen(true);
    else timer.current = setTimeout(close, HOVER_CLOSE_MS);
  };
  const context = (h: NodeHandle) => (e: MouseEvent) => {
    e.preventDefault();
    store.select(h);
    run("contextMenu.open", { x: e.clientX, y: e.clientY });
  };

  return (
    <span className="inline-flex shrink-0" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button ref={button} type="button" data-crumb-more="" aria-label="Ancestors" aria-expanded={open} className={className} {...(open ? {} : tooltip("Select a parent", "bottom"))} onClick={() => setOpen(true)}>
        <Icon name="chevron-down" className="size-3.5" />
      </button>
      <AnchoredPopover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} anchor={button} placement="bottom-start" maxHeightCeiling={360} className="bg-base-100 border-base-300 flex min-w-[12rem] max-w-[18rem] flex-col overflow-hidden rounded-lg border py-1 shadow-xl">
        <div role="menu" data-crumb-menu="" className="min-h-0 overflow-y-auto" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
          {page && <LayerPathRow label="Page" kind="page" glyph="file" depth={0} joinsChild onSelect={() => (store.run("canvas.set", { page }), close())} />}
          {crumbs.map((h, i) => {
            const last = i === crumbs.length - 1;
            return (
              <LayerPathRow
                key={`${h.range.from}:${h.tag}`}
                label={crumbLabel(crumbs, i)}
                kind={rowRole(h)}
                glyph={glyphFor(rowIcon(h))}
                depth={i + 1}
                current={last}
                global={isGlobalSection(h)}
                joinsChild={!last}
                onSelect={() => (store.select(h), close())}
                onHover={(on) => lit(on ? h : null)}
                onContextMenu={context(h)}
              />
            );
          })}
        </div>
      </AnchoredPopover>
    </span>
  );
}
