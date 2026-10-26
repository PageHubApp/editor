/**
 * The media manager's keys, as commands on the keymap (not a listener of its own): `Backspace` /
 * `Delete` delete the selection, `⌘A` selects all, `Escape` clears the selection, `Enter` picks or
 * previews, the arrows move the selection (and step the preview). The open manager registers a
 * session; with none open — or one that can't take the key right now — the command can't run, so
 * the key falls through to the canvas (`element.remove`, `selection.clear`, …).
 *
 * They sit above every other binding of the same key (media delete outranks the element delete,
 * the selection clear outranks Escape's overlay close) and never fire while a field has the focus.
 */
import { Prec, contributes, defineCommand, type Extension } from "@pagehub/engine";

export type MediaKeyAction = "delete" | "selectAll" | "clear" | "enter" | "left" | "right" | "up" | "down";

interface MediaKeySession {
  /** `dry`: only say whether the key would be taken; don't act. */
  run(action: MediaKeyAction, dry: boolean): boolean;
}

let session: MediaKeySession | null = null;

/** Register the open manager's session; returns the unregister (a newer session is left alone). */
export function setMediaKeySession(s: MediaKeySession): () => void {
  session = s;
  return () => void (session === s && (session = null));
}

const key = (id: string, title: string, action: MediaKeyAction) => defineCommand({ id, title, run: (ctx) => !!session?.run(action, !ctx.dispatch) });
const COMMANDS = [
  key("media.delete", "Delete selected media", "delete"),
  key("media.selectAll", "Select all media", "selectAll"),
  key("media.clearSelection", "Clear media selection", "clear"),
  key("media.enter", "Pick or preview media", "enter"),
  key("media.left", "Previous media", "left"),
  key("media.right", "Next media", "right"),
  key("media.up", "Media up", "up"),
  key("media.down", "Media down", "down"),
];

const WHEN = "!textEditing";
export const MEDIA_KEYS: Extension = [
  ...COMMANDS,
  Prec.highest(
    contributes({
      keybindings: [
        { command: "media.delete", key: "backspace", when: WHEN },
        { command: "media.delete", key: "delete", when: WHEN },
        { command: "media.selectAll", key: "mod+a", when: WHEN },
        { command: "media.clearSelection", key: "escape", when: WHEN },
        { command: "media.enter", key: "enter", when: WHEN },
        { command: "media.left", key: "left", when: WHEN },
        { command: "media.right", key: "right", when: WHEN },
        { command: "media.up", key: "up", when: WHEN },
        { command: "media.down", key: "down", when: WHEN },
      ],
    }),
  ),
];
