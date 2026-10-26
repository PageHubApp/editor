/**
 * The component board — what the editor shows in place of the page canvas while the
 * components editor is open (`boardOf(state).open`). Every partial is a card (`BoardCard`) on a
 * pannable, zoomable surface (`useBoardPan`), with labels / titles (`BoardNotes`) and the
 * floating `BoardToolbar`. No partials: "No components yet".
 *
 * Isolated (double-click, focus icon, Edit Linked Instance): the `Canvas` slot shows the
 * partial with every canvas tool, and an "Exit isolation" pill (top-left, the partial's name)
 * returns to the board.
 */
import { useCallback, useRef } from "react";
import { Slot } from "../../components";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";
import { activePartial, boardLayout, boardNames, boardOf } from "./boardState";
import { cardBox } from "./boardLayout";
import { BoardCard } from "./BoardCard";
import { BoardNotes } from "./BoardNotes";
import { BoardToolbar } from "./BoardToolbar";
import { BoardIcon } from "./boardIcons";
import { useBoardPan } from "./useBoardPan";

const nameOf = (path: string | null) => (path ?? "").replace(/^.*\/|\.liquid$/g, "");

export function Board() {
  const isolated = useEditorState((s) => boardOf(s).isolated);
  const active = useEditorState(activePartial);
  if (isolated) {
    return (
      <div data-slot="ComponentBoard" data-board-isolated="" className="relative flex h-full w-full flex-col">
        <Slot name="Canvas" />
        <ExitIsolation name={nameOf(active)} />
      </div>
    );
  }
  return <BoardSurface />;
}

function ExitIsolation({ name }: { name: string }) {
  const store = useEditorStore();
  return (
    <button
      type="button"
      data-board-exit=""
      onClick={() => store.run("component.isolate", { path: null })}
      className="bg-base-100 text-base-content border-base-300 hover:bg-base-200 pointer-events-auto absolute top-3 left-3 z-50 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm"
      {...tooltip("Exit isolation", "bottom")}
    >
      <BoardIcon name="x" className="size-3.5" />
      <BoardIcon name="boxModel" className="size-3.5 opacity-70" />
      <span className="max-w-[12rem] truncate">{name}</span>
    </button>
  );
}

function BoardSurface() {
  const store = useEditorStore();
  const surface = useRef<HTMLDivElement>(null);
  const sizes = useRef<Record<string, { w: number; h: number }>>({});
  const names = useEditorState(boardNames, (a, b) => a.join() === b.join());
  const layout = useEditorState(boardLayout, (a, b) => JSON.stringify(a.cards) === JSON.stringify(b.cards));
  const { cursor, panning, space } = useBoardPan(surface);
  const onMeasure = useCallback((name: string, size: { w: number; h: number }) => void (sizes.current[name] = size), []);

  const addNote = (kind: "label" | "title") => {
    const { pan, zoom } = boardOf(store.state);
    const el = surface.current;
    store.run("board.addNote", { kind, x: (-pan.x + (el?.clientWidth || 800) / 2) / zoom, y: (-pan.y + (el?.clientHeight || 600) / 2) / zoom });
  };

  return (
    <div ref={surface} data-slot="ComponentBoard" data-board-surface="" className="bg-base-200 relative h-full w-full overflow-hidden" style={{ cursor }}>
      {names.length === 0 && (
        <div data-board-empty="" className="text-base-content/60 pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-lg font-medium">No components yet</div>
          <div className="text-sm">Create a component from a section, then it&apos;ll appear here on the canvas.</div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0">
        {names.map((name, i) => (
          <BoardCard key={name} name={name} path={`partials/${name}.liquid`} box={cardBox(layout, name, i)} onMeasure={onMeasure} inert={panning || space} />
        ))}
        <BoardNotes />
      </div>
      <BoardToolbar count={names.length} onArrange={(axis) => store.run("board.arrange", { axis, sizes: { ...sizes.current } })} onAddNote={addNote} />
    </div>
  );
}
