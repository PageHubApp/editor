/** The open media manager's side of `mediaKeys.ts`: what each key does with the grid's current state. */
import { useEffect, useRef, type RefObject } from "react";
import { setMediaKeySession, type MediaKeyAction } from "./mediaKeys";
import { move } from "./mediaSelection";
import type { useMediaBrowser } from "./useMediaBrowser";

interface MediaKeyInput {
  open: boolean;
  root: RefObject<HTMLElement | null>;
  pickMode: boolean;
  browser: ReturnType<typeof useMediaBrowser>;
  /** The id being previewed. */
  preview: string | null;
  setPreview(id: string | null): void;
  /** The edit or folder dialog is open: the keys belong to it. */
  dialog: boolean;
  remove(): void;
  choose(id: string): void;
}

const ARROW = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" } as const;

export function useMediaKeys(input: MediaKeyInput): void {
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    if (!input.open) return;
    return setMediaKeySession({
      run(action: MediaKeyAction, dry) {
        const { browser: b, pickMode, preview, root, dialog } = latest.current;
        if (dialog) return false;
        const ids = b.visible.map((i) => i.id);
        if (preview) {
          // the preview takes the horizontal arrows only
          const to = action === "left" ? -1 : action === "right" ? 1 : 0;
          const next = ids[ids.indexOf(preview) + to];
          if (!to || next === undefined) return false;
          if (!dry) latest.current.setPreview(next);
          return true;
        }
        const inside = !!root.current?.contains(root.current.ownerDocument.activeElement);
        switch (action) {
          case "clear":
            return b.sel.ids.length > 0 && (dry || (b.clear(), true));
          case "delete":
            return !pickMode && b.sel.ids.length > 0 && (dry || (latest.current.remove(), true));
          case "selectAll":
            return !pickMode && ids.length > 0 && (dry || (b.all(), true));
          case "enter":
            return inside && !!b.sel.primary && (dry || (pickMode ? latest.current.choose(b.sel.primary) : latest.current.setPreview(b.sel.primary), true));
          default:
            return inside && !!move(b.sel, ids, ARROW[action], b.view) && (dry || b.arrow(ARROW[action]));
        }
      },
    });
  }, [input.open]);
}
