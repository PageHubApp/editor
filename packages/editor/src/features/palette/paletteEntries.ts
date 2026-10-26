/** The palette's rows: every registered command, minus the internal ones and those that need arguments. */
import { commandsFacet, keyLabel, paletteFacet, type Store } from "@pagehub/engine";
import { passesWhen } from "../keyboard/context";
import type { Platform } from "../keyboard/platform";
import type { PaletteEntry } from "./paletteSearch";

/** Commands that exist for the chrome itself, or that need arguments only a control can supply. */
const HIDDEN = new Set(["preview.exit", "element.insert", "attr.set", "classes.set", "classes.layers", "overlay.dismissTop", "palette.toggle", "palette.close", "contextMenu.open", "contextMenu.close", "sidebar.search", "ui.set"]);

/** `group@order` → the group's name. */
const categoryOf = (group: string | undefined): string => (group ? group.split("@")[0]!.replace(/^\d+_/, "") : "Other");

export function paletteEntries(editor: Store, platform: Platform): PaletteEntry[] {
  const items = new Map(editor.state.facet(paletteFacet).map((p) => [p.command, p]));
  const out: PaletteEntry[] = [];
  for (const cmd of editor.state.facet(commandsFacet).values()) {
    if (HIDDEN.has(cmd.id) || cmd.args) continue;
    const item = items.get(cmd.id);
    if (item && !passesWhen(editor, item.when)) continue;
    out.push({ id: cmd.id, title: cmd.title, category: categoryOf(item?.group), shortcut: keyLabel(editor, cmd.id, platform), enabled: editor.can(cmd.id) });
  }
  return out;
}
