/**
 * The More menu: a dropdown anchored under the top bar's More (≡) button, with Settings, View,
 * Tools and Preferences sections, each the `more/<section>` menu contributions (a plugin adds a
 * row by contributing one; rows whose command isn't registered or whose `when` fails are left
 * out, a section with no rows has no label). Toggles title themselves from the state they toggle
 * ("Show grid lines" / "Hide grid lines"). A pick runs its command and closes; an outside
 * pointerdown or Escape closes (through the shared `AnchoredPopover` / overlay stack).
 */
import { type RefObject } from "react";
import { commandsFacet, keyLabel, menusFacet, type EditorState, type MenuItem } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { chromeOf, MORE_SLOTS } from "../../shell/chromeState";
import { passesWhen } from "../keyboard/context";
import { formatShortcut, usePlatform } from "../keyboard/platform";
import { canvasOf } from "../canvas/canvasState";
import { toggleEditorTitle } from "../board/boardState";
import { layersDockedOf } from "../layers/layersKit";

/** The component-board toggle lives in the board connector's own slot; it reads as a Tools row
 * rather than a top-bar button (a host editor can reach the components editor from a menu, not
 * a bare top-bar glyph). */
const TOOLS_EXTRA: MenuItem = { command: "component.toggleEditor", group: "tools@20", when: "role != 'client'" };

const LABELS: Record<(typeof MORE_SLOTS)[number], string> = { "more/settings": "Settings", "more/view": "View", "more/tools": "Tools", "more/preferences": "Preferences" };
const ROW = "flex w-full cursor-pointer items-center gap-1 px-3 py-3 text-base-content/80 hover:bg-base-200 disabled:cursor-default disabled:opacity-40";

/** Titles that follow the state they toggle. */
function moreTitle(command: string, s: EditorState, fallback: string): string {
  const c = chromeOf(s);
  const v = canvasOf(s);
  const show = (on: boolean, what: string) => `${on ? "Hide" : "Show"} ${what}`;
  switch (command) {
    case "view.toggleGridlines":
      return show(c.gridlines, "grid lines");
    case "view.toggleMarkers":
      return show(v.markers, "breakpoint lines");
    case "view.toggleGuides":
      return show(v.guides, "device guides");
    case "view.toggleHidden":
      return show(c.showHidden, "hidden components");
    case "sidebar.toggleSide":
      return c.sidebarLeft ? "Move settings panel to the right" : "Move settings panel to the left";
    case "component.toggleEditor":
      return toggleEditorTitle(s);
    case "panel.layers":
      return "Pop out layers";
    case "layers.toggleDocked":
      return layersDockedOf(s) ? "Hide layers panel" : "Dock layers panel";
    default:
      return fallback;
  }
}

export function MoreMenu({ anchor }: { anchor?: RefObject<HTMLElement | null> }) {
  const editor = useEditorStore();
  const platform = usePlatform();
  const state = useEditorState((s) => s);
  const commands = state.facet(commandsFacet);
  const menus = state.facet(menusFacet);
  return (
    <AnchoredPopover
      open
      onOpenChange={(next) => !next && void editor.run("drawer.close")}
      anchor={anchor}
      placement="bottom-end"
      maxHeightCeiling={0.7 * window.innerHeight}
      className="bg-base-100 text-base-content border-base-300 w-72 overflow-y-auto rounded-xl border pb-2 shadow-lg"
    >
      <nav role="navigation" aria-label="Editor menu" data-more-menu="">
        {MORE_SLOTS.map((slot) => {
          const contributed = slot === "more/tools" && !(menus[slot] ?? []).some((m) => m.command === TOOLS_EXTRA.command) ? [...(menus[slot] ?? []), TOOLS_EXTRA] : (menus[slot] ?? []);
          const rows = contributed.filter((m) => commands.has(m.command) && passesWhen(editor, m.when));
          if (!rows.length) return null;
          return (
            <div key={slot} data-more-section={slot} role="group" aria-label={LABELS[slot]}>
              <div className="text-base-content/60 px-3 pt-3 pb-1 text-[10px] font-medium tracking-widest uppercase">{LABELS[slot]}</div>
              {rows.map((m) => {
                const shortcut = keyLabel(editor, m.command, platform);
                return (
                  <button key={m.command} type="button" role="menuitem" data-command={m.command} className={ROW} disabled={!editor.can(m.command)} onClick={() => (editor.run(m.command), editor.run("drawer.close"))}>
                    <span className="min-w-0 flex-1 text-left text-sm">{moreTitle(m.command, state, commands.get(m.command)!.title)}</span>
                    {shortcut && <kbd className="border-base-300 bg-base-200 text-base-content/80 ml-auto rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide">{formatShortcut(shortcut, platform)}</kbd>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </AnchoredPopover>
  );
}
