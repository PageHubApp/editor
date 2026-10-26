/**
 * The ⌘K command palette: a top-aligned Modal with a search field over every command the editor
 * can run. State is the chrome field's `paletteOpen`, so the keymap, the top bar and tests open
 * it by running `palette.toggle`.
 *
 * Enter or a click closes the palette and runs the command on the next tick, so the command
 * sees the editor's focus, not the palette's. Disabled rows (the command can't run now) are
 * greyed and inert. ↑↓ stop at the ends; Home / End jump.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { formatShortcut, usePlatform } from "../keyboard/platform";
import { Modal } from "../../primitives/Modal";
import { Z_PALETTE } from "../../primitives/zIndex";
import { Icon } from "../../primitives/icons";
import { paletteEntries } from "./paletteEntries";
import { searchEntries, type PaletteEntry } from "./paletteSearch";

export function CommandPalette() {
  const editor = useEditorStore();
  const open = useEditorState((s) => chromeOf(s).paletteOpen);
  return (
    <>
      <span data-slot="CommandPalette" hidden />
      <Modal isOpen={open} onClose={() => editor.run("palette.close")} id="command-palette" ariaLabel="Command palette" align="top" size="palette" tintClassName="bg-black/40" blur={2} zIndex={Z_PALETTE}>
        <PaletteBody />
      </Modal>
    </>
  );
}

function PaletteBody() {
  const editor = useEditorStore();
  const platform = usePlatform();
  useEditorState((s) => s); // the enabled flags follow the document
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const entries = paletteEntries(editor, platform);
  const rows = searchEntries(entries, query);

  useEffect(() => {
    const raf = requestAnimationFrame(() => (input.current?.focus(), input.current?.select()));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => void (list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" })), [active]);

  const run = (entry: PaletteEntry | undefined) => {
    if (!entry?.enabled) return;
    editor.run("palette.close");
    setTimeout(() => editor.run(entry.id), 0);
  };
  const last = rows.length - 1;
  const onKeyDown = (e: React.KeyboardEvent) => {
    const to = e.key === "ArrowDown" ? Math.min(active + 1, last) : e.key === "ArrowUp" ? Math.max(active - 1, 0) : e.key === "Home" ? 0 : e.key === "End" ? Math.max(last, 0) : null;
    if (to !== null) (e.preventDefault(), setActive(to));
    else if (e.key === "Enter") (e.preventDefault(), run(rows[active]));
  };

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="border-base-300 flex items-center gap-2 border-b px-3 py-2.5">
        <Icon name="search" className="size-4 opacity-60" />
        <input
          ref={input}
          role="combobox"
          aria-expanded
          aria-controls="ph-palette-list"
          aria-activedescendant={rows[active] ? `ph-palette-${rows[active]!.id}` : undefined}
          aria-label="Search commands"
          className="w-full bg-transparent text-sm outline-none"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => (setQuery(e.target.value), setActive(0))}
          onKeyDown={onKeyDown}
        />
      </div>
      <div ref={list} id="ph-palette-list" role="listbox" className="min-h-0 flex-1 overflow-auto py-1">
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-xs opacity-60">{query.trim() ? `No commands found for “${query.trim()}”` : "No commands available in this context."}</div>
        )}
        {rows.map((entry, i) => (
          <Fragment key={entry.id}>
            {(i === 0 || rows[i - 1]!.category !== entry.category) && <div className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase opacity-50">{entry.category}</div>}
            <div
              id={`ph-palette-${entry.id}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={!entry.enabled}
              data-index={i}
              data-command={entry.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(entry)}
              className={`mx-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-sm ${i === active ? "bg-base-200" : ""} ${entry.enabled ? "" : "cursor-default opacity-40"}`}
            >
              <span className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              <span className="bg-base-200 rounded px-1.5 py-0.5 text-[10px] opacity-70">{entry.category}</span>
              {entry.shortcut && <kbd className="text-[11px] opacity-60">{formatShortcut(entry.shortcut, platform)}</kbd>}
            </div>
          </Fragment>
        ))}
      </div>
      <div className="border-base-300 flex items-center justify-between border-t px-4 py-2 text-[11px] opacity-60">
        <span>↑↓ navigate · ↵ select · esc close</span>
        <span>
          {rows.length} {rows.length === 1 ? "command" : "commands"}
        </span>
      </div>
    </div>
  );
}
