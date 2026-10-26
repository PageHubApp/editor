/**
 * The `LayersPanel` slot: the page tree that fills the sidebar's Layers tab, directly under the
 * `Edit | Layers | Add` header (no panel header or resize handle of its own: the tab is the title),
 * and the pop-out dialog.
 *
 * The real editor's three More › View rows all land here:
 * - **Pop out layers** (`panel.layers`, ⇧⌘L): the tree floats in a FloatingPanel (340×500,
 *   280–600 × 300–700, docked to the sidebar's edge, size persisted) while `chrome.panel` is
 *   `layers`.
 * - **Dock layers panel / Hide layers panel** (`layers.toggleDocked`): persists the docked
 *   preference and titles itself from it (the standalone's Layers *tab* always shows the tree, so
 *   the preference has no separate collapsed surface to toggle — the tab is the dock).
 */
import { useEditorState, useRunCommand } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { FloatingPanel } from "../../primitives/FloatingPanel";
import { Z_MODAL } from "../../primitives/zIndex";
import { LayerTree } from "./LayerTree";
import { Icon } from "../../primitives/icons";
import { AutoHideScrollbar } from "../../primitives/AutoHideScrollbar";

function Tree() {
  return (
    <AutoHideScrollbar className="bg-base-100 text-base-content min-h-0 flex-1">
      <LayerTree />
    </AutoHideScrollbar>
  );
}

export function LayersPanel() {
  const run = useRunCommand();
  const popped = useEditorState((s) => chromeOf(s).panel === "layers");
  const sidebarLeft = useEditorState((s) => chromeOf(s).sidebarLeft);

  return (
    <>
      <div data-slot="LayersPanel" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tree />
      </div>
      <FloatingPanel
        isOpen={popped}
        onClose={() => run("panel.layers")}
        title="Layers"
        icon={<Icon name="layout-grid" className="size-3.5" />}
        storageKey="layers-dialog"
        autoSize={false}
        defaultWidth={340}
        defaultHeight={500}
        minWidth={280}
        maxWidth={600}
        minHeight={300}
        maxHeight={700}
        dockToEdge={sidebarLeft ? "left" : "right"}
        closeButtonSide="right"
        zIndex={Z_MODAL}
      >
        <div data-layers-dialog="" className="bg-base-100 text-base-content flex min-h-0 flex-1 flex-col overflow-hidden">
          <Tree />
        </div>
      </FloatingPanel>
    </>
  );
}
