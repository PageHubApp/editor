/**
 * The `AddPanel` slot: the Add flyout over the inspector column (top `--editor-nav-height`,
 * bottom `--sidebar-layers-height`), open while `insert.toggle` / `insert.open` say so. Tabs
 * Components | Blocks (←/→ cycle); without a block source (or `enabled: false`) the tab strip
 * is dropped and the Components panel shows alone. The host's AI button (`addPanelAiFacet`)
 * sits right of the tabs. Tab, category, filters and query survive a close, so reopening
 * restores them; a host that provides `addPanelUrlFacet` also gets them in the URL.
 */
import { useEditorState, useRunCommand } from "../../react/bindings";
import { addPanelAiFacet } from "./addPanelHost";
import { addPanelOf, type AddTab } from "./addPanelState";
import { blockSourceFacet } from "@pagehub/engine/host";
import { BlocksTab } from "./BlocksTab";
import { ComponentsTab } from "./ComponentsTab";
import { SectionDialog } from "./SectionDialog";
import { TabStrip } from "./panelParts";
import { useAddPanelUrl } from "./useAddPanelUrl";

const TABS: readonly { id: AddTab; label: string }[] = [
  { id: "components", label: "Components" },
  { id: "blocks", label: "Blocks" },
];

export function AddPanel() {
  const run = useRunCommand();
  const open = useEditorState((s) => addPanelOf(s).open);
  const tab = useEditorState((s) => addPanelOf(s).tab);
  const blocks = useEditorState((s) => {
    const src = s.facet(blockSourceFacet);
    return !!src && src.enabled !== false;
  });
  const Ai = useEditorState((s) => s.facet(addPanelAiFacet));
  useAddPanelUrl();
  const dialog = <SectionDialog />;
  if (!open)
    return (
      <>
        <span data-slot="AddPanel" hidden />
        {dialog}
      </>
    );
  const current = blocks ? tab : "components";
  return (
    <>
      {dialog}
      <div
        data-slot="AddPanel"
        role="dialog"
        aria-label="Add"
        className="bg-base-100 text-base-content absolute inset-x-0 z-[52] flex flex-col overflow-hidden"
        style={{ top: "var(--editor-nav-height, 0px)", bottom: "var(--sidebar-layers-height, 0px)" }}
      >
        {blocks ? (
          <TabStrip label="Content tabs" tabs={TABS} value={current} onChange={(id) => run("insert.set", { tab: id })} trailing={Ai && <div data-add-ai="" className="flex shrink-0 items-center px-2"><Ai /></div>} />
        ) : (
          Ai && <div data-add-ai="" className="border-sidebar-border flex shrink-0 justify-end border-b px-2 py-1"><Ai /></div>
        )}
        {current === "blocks" ? <BlocksTab /> : <ComponentsTab />}
      </div>
    </>
  );
}
