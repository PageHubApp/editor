/**
 * `htmlKit()`: the HTML elements, the commands every editor needs, today's
 * keybindings with the fixed behaviour (each `when` + `can()` decides; an unhandled key passes
 * through), the HTML rules, and the id-element list for persisted identity. `file.save` is
 * the editor's own command (it needs storage); `history.undo/redo` come from `history()`.
 */
import { contributes } from "../../commands/contributes";
import type { Extension } from "../../extensions/extension";
import { editorAttrValue } from "../../rules/core/security";
import { headingOrder, imgAlt, inputLabel, singleH1 } from "../../rules/core/a11y";
import { parseRule } from "../../rules/core/structural";
import { clipboardFacet, type Clipboard } from "./clipboard";
import { HTML_COMMANDS } from "./commands";
import { attrSet } from "./attrCommand";
import { HTML_ELEMENTS } from "./elements";
import { HTML_ID_ELEMENTS, idElementsFacet } from "./idElements";

export const HTML_RULES = [parseRule, editorAttrValue, imgAlt, inputLabel, headingOrder, singleH1] as const;

const NODE = "selection && !textEditing";

/** Today's bindings (inventory Part 1), each guarded so the native key works when the command can't run. */
export const HTML_KEYBINDINGS = contributes({
  keybindings: [
    { command: "element.copy", key: "mod+c", when: NODE },
    { command: "element.cut", key: "mod+x", when: NODE },
    { command: "element.paste", key: "mod+v", when: "selection && !textEditing && !mediaManagerOpen" },
    { command: "element.duplicate", key: "mod+d", when: NODE },
    { command: "element.remove", key: "backspace", when: NODE },
    { command: "element.remove", key: "delete", when: NODE },
    { command: "element.selectNext", key: "tab", when: NODE },
    { command: "element.selectPrev", key: "shift+tab", when: NODE },
    { command: "element.moveUp", key: "alt+up", when: NODE },
    { command: "element.moveDown", key: "alt+down", when: NODE },
    { command: "selection.up", key: "escape", when: NODE },
    { command: "file.save", key: "mod+s", when: "!textEditing" },
  ],
  menus: {
    "canvas/context": [
      { command: "selection.clear", group: "1_selection@1" },
      { command: "element.copy", group: "2_clipboard@1" },
      { command: "element.paste", group: "2_clipboard@2" },
      { command: "element.selectParent", group: "3_navigate@1" },
      { command: "element.moveUp", group: "3_navigate@2" },
      { command: "element.moveDown", group: "3_navigate@3" },
      { command: "element.duplicate", group: "5_edit@1" },
      { command: "element.remove", group: "5_edit@3" },
    ],
  },
});

const DEFAULT: Extension = [HTML_ELEMENTS, HTML_COMMANDS, attrSet, HTML_KEYBINDINGS, HTML_RULES, idElementsFacet.of(HTML_ID_ELEMENTS)];

export interface HtmlKitOptions {
  /** The clipboard copy / paste use (default: one shared in-memory clipboard; `systemClipboard()` in a browser). */
  clipboard?: Clipboard;
}

/** Same value on every call without options, so listing the kit twice registers it once. */
export function htmlKit(opts: HtmlKitOptions = {}): Extension {
  return opts.clipboard ? [DEFAULT, clipboardFacet.of(opts.clipboard)] : DEFAULT;
}
