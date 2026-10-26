/**
 * The board's floating toolbar (top-right): "N components", New component, Arrange in a row /
 * column, Add label, Add title, then zoom (− / percentage / +, stepping through the presets;
 * the percentage resets to 100%). While a card is isolated the canvas shows it, with its own zoom.
 */
import { useEditorState, useEditorStore } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";
import { boardOf } from "./boardState";
import { BoardIcon, type BoardIconName } from "./boardIcons";

export const ZOOM_PRESETS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 5, 7.5, 10] as const;

const nextZoom = (z: number, dir: 1 | -1): number =>
  dir > 0 ? (ZOOM_PRESETS.find((p) => p > z + 1e-6) ?? ZOOM_PRESETS.at(-1)!) : ([...ZOOM_PRESETS].reverse().find((p) => p < z - 1e-6) ?? ZOOM_PRESETS[0]);

const BTN = "hover:bg-neutral text-neutral-content rounded p-1.5";

interface BoardToolbarProps {
  count: number;
  onArrange(axis: "row" | "column"): void;
  onAddNote(kind: "label" | "title"): void;
}

function ToolButton({ id, icon, label, onClick }: { id: string; icon: BoardIconName; label: string; onClick(): void }) {
  return (
    <button type="button" data-board-tool={id} aria-label={label} onClick={onClick} className={BTN} {...tooltip(label, "bottom")}>
      <BoardIcon name={icon} />
    </button>
  );
}

const Divider = () => <div className="bg-base-content/20 h-4 w-px" />;

export function BoardToolbar({ count, onArrange, onAddNote }: BoardToolbarProps) {
  const store = useEditorStore();
  const zoom = useEditorState((s) => boardOf(s).zoom);
  return (
    <div data-board-toolbar="" className="bg-neutral/95 pointer-events-auto absolute top-3 right-3 z-50 flex items-center gap-2 rounded-md px-3 py-2 shadow-lg backdrop-blur-sm">
      <span className="text-neutral-content/70 px-1 text-xs">
        {count} {count === 1 ? "component" : "components"}
      </span>
      <Divider />
      <ToolButton id="new" icon="gridAdd" label="New component" onClick={() => store.run("component.new")} />
      <ToolButton id="row" icon="alignTop" label="Arrange in a row" onClick={() => onArrange("row")} />
      <ToolButton id="column" icon="alignLeft" label="Arrange in a column" onClick={() => onArrange("column")} />
      <Divider />
      <ToolButton id="label" icon="textSize" label="Add label" onClick={() => onAddNote("label")} />
      <ToolButton id="title" icon="heading" label="Add title" onClick={() => onAddNote("title")} />
      <Divider />
      <ToolButton id="zoom-out" icon="minus" label="Zoom out" onClick={() => store.run("board.view", { zoom: nextZoom(zoom, -1) })} />
      <button type="button" data-board-zoom="" className={`${BTN} min-w-12 text-xs tabular-nums`} onClick={() => store.run("board.view", { zoom: 1 })} {...tooltip("Reset to 100%", "bottom")}>
        {Math.round(zoom * 100)}%
      </button>
      <ToolButton id="zoom-in" icon="plus" label="Zoom in" onClick={() => store.run("board.view", { zoom: nextZoom(zoom, 1) })} />
    </div>
  );
}
