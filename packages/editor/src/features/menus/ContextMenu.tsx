/**
 * The canvas right-click menu. Items are the `canvas/context` contributions (command, group,
 * `when`), so a plugin adds a row by contributing one; titles, enabled state and shortcut labels
 * come from the commands and their bindings. A row that doesn't apply (its `when` fails, or its
 * command can't run: Paste with nothing copied, Insert on a text element)
 * is hidden; only `DISABLE_ONLY` rows stay visible greyed out. Groups are separated by dividers,
 * and a menu with no rows closes itself.
 * Open it with the `contextMenu.open` command; a pick runs its command and closes (except `KEEP_OPEN` rows).
 * The `4_insert` rows are one "Insert ▸" submenu; "Select parent" hides when it can't run; the host's
 * AI command (`aiChatFacet`) adds a last "Include in AI chat" row.
 */
import { Fragment, useEffect } from "react";
import { commandsFacet, keyLabel, menusFacet, type MenuItem } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { passesWhen } from "../keyboard/context";
import { formatShortcut, usePlatform } from "../keyboard/platform";
import { useAiChatCommand } from "./aiChat";
import { insertRowApplies } from "./contextMenuKit";
import { INSERT_GROUP, InsertSubmenu } from "./InsertSubmenu";
import { MENU_ITEM, MenuDivider, MenuSurface } from "./MenuSurface";

const CONTEXT_MENU_SLOT = "canvas/context";

/** Rows whose pick leaves the menu open (Copy classes: the copy is silent, so the menu stays as the confirmation). */
const KEEP_OPEN: ReadonlySet<string> = new Set(["classes.copy", "element.moveUp", "element.moveDown"]);

/** "Select parent" vanishes (rather than disables) when the parent is the document itself, which is never selected. */
const documentParent = (editor: { state: { selection: { primary: { alive: boolean; parent(): { tag: string } | null } | null } } }): boolean => {
  const sel = editor.state.selection.primary;
  const tag = sel?.alive ? sel.parent()?.tag : undefined;
  return tag === "html" || tag === "body";
};
const AI_ROW = "Include in AI chat";

/** Rows shown greyed out rather than hidden: the move ends, a plain copy of the classes, convert. */
const DISABLE_ONLY: ReadonlySet<string> = new Set(["element.moveUp", "element.moveDown", "classes.copy", "component.convert"]);

/** `2_clipboard@1` → `2_clipboard`. */
const groupName = (group: string | undefined): string => (group ?? "").split("@")[0]!;

export function ContextMenu() {
  const editor = useEditorStore();
  const platform = usePlatform();
  const at = useEditorState((s) => chromeOf(s).contextMenu);
  useEditorState((s) => s); // enabled flags follow the document
  const close = () => void editor.run("contextMenu.close");
  const commands = editor.state.facet(commandsFacet);
  const ai = useAiChatCommand();
  const seen = new Set<string>();
  const primary = editor.state.selection.primary as Parameters<typeof insertRowApplies>[1];
  /** Rows that make no sense for the selection are hidden. */
  const applies = (m: MenuItem): boolean =>
    commands.has(m.command) &&
    passesWhen(editor, m.when) &&
    (DISABLE_ONLY.has(m.command) || editor.can(m.command)) &&
    !(m.command === "element.selectParent" && documentParent(editor)) &&
    insertRowApplies(m.command, primary);
  const rows = (at ? (editor.state.facet(menusFacet)[CONTEXT_MENU_SLOT] ?? []) : []).filter((m) => {
    if (seen.has(m.command) || !applies(m)) return false;
    return !!seen.add(m.command);
  });
  const aiAt = ai && commands.has(ai) ? editor.state.selection.primary : null;
  const empty = !!at && rows.length === 0 && !aiAt;
  useEffect(() => void (empty && editor.run("contextMenu.close")), [empty, editor]);
  const insertRows = rows.filter((m) => groupName(m.group) === INSERT_GROUP);
  const insertAt = rows.findIndex((m) => groupName(m.group) === INSERT_GROUP);
  /** Row `i` of `rows`, with the Insert submenu standing in at its first row. */
  const entries = rows.flatMap((m, i): Array<{ m: MenuItem | null; group: string }> => (groupName(m.group) !== INSERT_GROUP ? [{ m, group: groupName(m.group) }] : i === insertAt ? [{ m: null, group: INSERT_GROUP }] : []));

  return (
    <>
      <span data-slot="ContextMenu" hidden />
      <MenuSurface at={rows.length || aiAt ? at : null} id="context-menu" ariaLabel="Element actions" onClose={close}>
        {entries.map(({ m, group }, i) => {
          const divider = i > 0 && entries[i - 1]!.group !== group && <MenuDivider />;
          if (!m) return <Fragment key="insert">{divider}<InsertSubmenu rows={insertRows} onClose={close} /></Fragment>;
          const shortcut = keyLabel(editor, m.command, platform);
          return (
            <Fragment key={`${m.command}:${i}`}>
              {divider}
              <button
                type="button"
                role="menuitem"
                data-command={m.command}
                className={MENU_ITEM}
                disabled={!editor.can(m.command)}
                onClick={() => {
                  editor.run(m.command);
                  if (!KEEP_OPEN.has(m.command)) close();
                }}
              >
                <span className="flex-1">{commands.get(m.command)!.title}</span>
                {shortcut && <kbd className="text-[11px] opacity-60">{formatShortcut(shortcut, platform)}</kbd>}
              </button>
            </Fragment>
          );
        })}
        {aiAt && ai && (
          <>
            {entries.length > 0 && <MenuDivider />}
            <button type="button" role="menuitem" data-command={ai} className={MENU_ITEM} disabled={!editor.can(ai, { at: aiAt })} onClick={() => (editor.run(ai, { at: aiAt }), close())}>
              <span className="flex-1">{AI_ROW}</span>
            </button>
          </>
        )}
      </MenuSurface>
    </>
  );
}
