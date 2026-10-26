/**
 * Right-click inside the text being edited: "Include in chat" (only when the host provides
 * `includeInChatFacet`, and there is a selection) and "Insert variable" (opens that panel).
 * A pick closes the menu; Esc closes it through the overlay stack.
 */
import { includeInChatFacet } from "./hooks";
import type { RichTextSession } from "./session";
import { MENU_ITEM, MenuSurface } from "../menus/MenuSurface";

export function TextContextMenu({ session, at, onClose }: { session: RichTextSession; at: { x: number; y: number } | null; onClose(): void }) {
  const chat = session.store.state.facet(includeInChatFacet);
  const { from, to, empty } = session.editor.state.selection;
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <MenuSurface at={at} id="text-context-menu" ariaLabel="Text actions" onClose={onClose} width={200} height={80}>
      {chat && !empty && (
        <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(() => chat({ text: session.editor.state.doc.textBetween(from, to, " "), handle: session.handle }))}>
          Include in chat
        </button>
      )}
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(() => void session.store.run("richtext.panel", { panel: "variable" }))}>
        Insert variable
      </button>
    </MenuSurface>
  );
}
