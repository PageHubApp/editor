/**
 * The context menu's "Insert ▸" row: opens on hover (and on click) as a submenu to the right
 * (flipped to the left when it would leave the window), closes 160ms after the pointer leaves.
 * Its rows are the `4_insert` contributions that can run here (the menu drops the rest, and the
 * whole row when none can); the row for `insert.component` opens the component
 * flyout instead of running. Esc closes the flyout, then the submenu, then the menu (each is an
 * overlay-stack entry pushed in that order).
 */
import { useRef } from "react";
import { commandsFacet, type MenuItem } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { useOverlay } from "../../primitives/overlayStack";
import { ComponentFlyout, FLYOUT_SIZE } from "./ComponentFlyout";
import { MENU_ITEM } from "./MenuSurface";
import { useGraceHover } from "./useGraceHover";

export const INSERT_GROUP = "4_insert";
const COMPONENT_FLYOUT_COMMAND = "insert.component";

/** True when a panel of `width` opened from `el`'s right edge would leave the window. */
const flips = (el: HTMLElement | null, width: number) => !!el && el.getBoundingClientRect().right + width > window.innerWidth;

export function InsertSubmenu({ rows, onClose }: { rows: MenuItem[]; onClose(): void }) {
  const editor = useEditorStore();
  const commands = editor.state.facet(commandsFacet);
  useEditorState((s) => s); // enabled flags follow the document
  const sub = useGraceHover();
  const fly = useGraceHover();
  const wrap = useRef<HTMLDivElement>(null);
  const flyWrap = useRef<HTMLDivElement>(null);
  useOverlay({ id: "context-menu-insert", isOpen: sub.open, onDismiss: sub.close });
  useOverlay({ id: "context-menu-components", isOpen: fly.open, onDismiss: fly.close });
  const left = sub.open && flips(wrap.current, 228);
  const flyLeft = fly.open && flips(flyWrap.current, FLYOUT_SIZE.width);

  return (
    <div ref={wrap} className="relative" data-submenu="insert" onMouseEnter={sub.enter} onMouseLeave={sub.leave}>
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub.open} data-submenu-trigger="insert" className={MENU_ITEM} onClick={sub.toggle}>
        <span className="flex-1">Insert</span>
        <span aria-hidden className="opacity-60">▸</span>
      </button>
      {sub.open && (
        <div role="menu" aria-label="Insert" className={`border-base-300/50 bg-base-100 absolute top-0 min-w-[12rem] rounded-xl border py-1 shadow-xl ${left ? "right-full" : "left-full"}`}>
          {rows.map((m) =>
            m.command === COMPONENT_FLYOUT_COMMAND ? (
              <div key={m.command} ref={flyWrap} className="relative" onMouseEnter={fly.enter} onMouseLeave={fly.leave}>
                <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={fly.open} data-command={m.command} className={MENU_ITEM} onClick={fly.toggle}>
                  <span className="flex-1">{commands.get(m.command)!.title}</span>
                  <span aria-hidden className="opacity-60">▸</span>
                </button>
                {fly.open && (
                  <div className={flyLeft ? "[&>[data-flyout]]:right-full [&>[data-flyout]]:left-auto" : ""}>
                    <ComponentFlyout onPicked={onClose} />
                  </div>
                )}
              </div>
            ) : (
              <button
                key={m.command}
                type="button"
                role="menuitem"
                data-command={m.command}
                className={MENU_ITEM}
                onClick={() => {
                  editor.run(m.command);
                  onClose();
                }}
              >
                <span className="flex-1">{commands.get(m.command)!.title}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
