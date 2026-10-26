/**
 * The board's labels and titles (`notes` in `.editor/board.json`): a title is text-2xl
 * semibold, a label text-sm medium. Drag moves one (one `board.setNote` on release);
 * double-click edits its text (Enter or blur saves, Esc cancels); the hover × removes it.
 */
import { useRef, useState } from "react";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { useDragGesture } from "../../primitives/useDragGesture";
import { tooltip } from "../../primitives/tooltip";
import { boardLayout, boardOf } from "./boardState";
import type { BoardNote } from "./boardLayout";
import { BoardIcon } from "./boardIcons";

export function BoardNotes() {
  const notes = useEditorState((s) => boardLayout(s).notes, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  return (
    <>
      {notes.map((n) => (
        <Note key={n.id} note={n} />
      ))}
    </>
  );
}

function Note({ note }: { note: BoardNote }) {
  const store = useEditorStore();
  const { pan, zoom } = useEditorState((s) => boardOf(s), (a, b) => a.pan === b.pan && a.zoom === b.zoom);
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const drag = useDragGesture({
    threshold: 3,
    onStart: () => !editing,
    onMove: (_e, m) => setLive((liveRef.current = { x: note.x + m.dx / zoom, y: note.y + m.dy / zoom })),
    onEnd: (_e, moved) => {
      const at = liveRef.current;
      liveRef.current = null;
      setLive(null);
      if (moved && at) store.run("board.setNote", { id: note.id, x: at.x, y: at.y });
    },
  });
  const at = live ?? note;
  const size = note.kind === "title" ? "text-2xl font-semibold text-base-content" : "text-sm font-medium text-base-content/80";
  const save = (text: string) => {
    setEditing(false);
    if (text.trim() && text !== note.text) store.run("board.setNote", { id: note.id, text: text.trim() });
  };
  return (
    <div
      data-board-note={note.id}
      className={`group pointer-events-auto absolute top-0 left-0 cursor-move rounded px-1 select-none ${size}`}
      style={{ transform: `translate3d(${pan.x + at.x * zoom}px, ${pan.y + at.y * zoom}px, 0)` }}
      onPointerDown={drag.onPointerDown}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <input
          autoFocus
          data-board-note-input=""
          aria-label={note.kind === "title" ? "Title" : "Label"}
          defaultValue={note.text}
          className="input input-xs bg-base-100 w-48"
          onKeyDown={(e) => {
            if (e.key === "Enter") save(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={(e) => save(e.currentTarget.value)}
        />
      ) : (
        note.text
      )}
      <button
        type="button"
        data-board-note-remove=""
        aria-label="Remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => store.run("board.setNote", { id: note.id, remove: true })}
        className="bg-error text-error-content absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full opacity-0 shadow group-hover:opacity-100"
        {...tooltip("Remove", "top")}
      >
        <BoardIcon name="x" className="size-3" />
      </button>
    </div>
  );
}
