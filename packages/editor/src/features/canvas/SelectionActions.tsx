/**
 * The action buttons on the selected element's name tag: Move up · Move down · Duplicate ·
 * Include in AI chat · Delete, then ⋯ for the full right-click menu (`contextMenu.open`, under
 * the button). Each button runs the same command as its context-menu row (one undo step), shows
 * only when that command is registered, and is disabled while it can't run (Move up on a first
 * child). Tooltips carry the command's shortcut.
 *
 * The whole group steps aside — the tag stays as it is — in preview, in content mode (client /
 * viewer), with several elements selected, while a drag or a handle drag runs, and while a text
 * is being edited inline. `useSelectionActionsShown` says when; the tag then keeps its own AI button.
 */
import { commandsFacet, keyLabel, type EditorState } from "@pagehub/engine";
import { useRef } from "react";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { Icon, type IconName } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { formatShortcut, usePlatform } from "../keyboard/platform";
import { useDragSession } from "../dnd/dragSession";
import { richTextOf } from "../richtext/richTextState";
import { IncludeInAiButton } from "./NodeToolExtras";
import { useHandleDragging } from "./handleDrag";

const BUTTON = "hover:bg-base-200 flex size-4 items-center justify-center rounded disabled:opacity-40 disabled:hover:bg-transparent";

/** Order on the tag; the AI button (when the host has one) sits before Delete. */
const ACTIONS: ReadonlyArray<{ command: string; label: string; icon: IconName }> = [
  { command: "element.moveUp", label: "Move up", icon: "arrow-up" },
  { command: "element.moveDown", label: "Move down", icon: "arrow-down" },
  { command: "element.duplicate", label: "Duplicate", icon: "copy" },
  { command: "element.remove", label: "Delete", icon: "trash" },
];
const DELETE = "element.remove";

/** True when the action group belongs on the tag (see the file comment for when it doesn't). */
export function useSelectionActionsShown(): boolean {
  const store = useEditorStore();
  const calm = useEditorState((s: EditorState) => !chromeOf(s).preview && s.selection.handles.length <= 1 && !richTextOf(s).editing);
  const dragging = useDragSession();
  const handleDrag = useHandleDragging();
  const role = (store as { role?: string }).role;
  return calm && !dragging && !handleDrag && role !== "client" && role !== "viewer";
}

export function SelectionActions() {
  const store = useEditorStore();
  const platform = usePlatform();
  const more = useRef<HTMLButtonElement>(null);
  const commands = store.state.facet(commandsFacet);
  const present = ACTIONS.filter((a) => commands.has(a.command));
  // enabled flags follow the document and the selection
  useEditorState(() => present.map((a) => (store.can(a.command) ? 1 : 0)).join(""));
  // nothing here can run (the page itself): the tag keeps just its AI button
  if (!present.some((a) => store.can(a.command))) return <IncludeInAiButton className={BUTTON} iconClassName="size-3" />;
  const button = (a: (typeof ACTIONS)[number]) => {
    const key = keyLabel(store, a.command, platform);
    return (
      <button key={a.command} type="button" data-selection-action={a.command} aria-label={a.label} disabled={!store.can(a.command)} className={BUTTON} {...tooltip(key ? `${a.label} (${formatShortcut(key, platform)})` : a.label, "top")} onClick={() => store.run(a.command)}>
        <Icon name={a.icon} className="size-3" />
      </button>
    );
  };
  const openMenu = () => {
    const r = more.current?.getBoundingClientRect();
    if (r) store.run("contextMenu.open", { x: r.left, y: r.bottom + 4 });
  };
  return (
    <span data-selection-actions="" className="inline-flex items-center gap-0.5">
      <span className="border-base-300 mx-0.5 h-3 border-l" aria-hidden />
      {present.filter((a) => a.command !== DELETE).map(button)}
      <IncludeInAiButton className={BUTTON} iconClassName="size-3" />
      {present.filter((a) => a.command === DELETE).map(button)}
      <span className="border-base-300 mx-0.5 h-3 border-l" aria-hidden />
      <button ref={more} type="button" data-selection-more="" aria-label="More actions" aria-haspopup="menu" className={BUTTON} {...tooltip("More actions", "top")} onClick={openMenu}>
        <Icon name="dots" className="size-3" />
      </button>
    </span>
  );
}
