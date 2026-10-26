import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** The curated public surface (docs/OSS-RESTRUCTURE-PLAN.md §2.2). Adding a name here is an API decision. */
const SURFACE = {
  index: {
    load: () => import("../src/index.ts"),
    names: ["DEFAULT_COMPONENTS", "Editor", "aiChatFacet", "Slot", "defaultCanvasRender", "editorKit", "emailEditorKit", "mountEditor", "useEditorState", "useEditorStore", "useRunCommand", "useSlot", "useUi"],
  },
  components: {
    load: () => import("../src/components.entry.ts"),
    names: [
      "AddPanel", "Board", "CodeMirrorView", "ColorPicker", "CommandPalette", "ContextMenu", "DiffPreview", "EditorSkeleton", "EmptyState", "FontPicker", "IconPicker",
      "Inspector", "InspectorSectionView", "LayersPanel", "MediaManager", "ModifiersPanel", "PageSelector", "SaveBanner", "SaveStatus", "ScriptsPanel", "Sidebar", "ThemePanel", "TopBar", "Viewport",
    ],
  },
  primitives: {
    load: () => import("../src/primitives.entry.ts"),
    names: [
      "AnchoredPopover", "Chip", "ConfirmDialog", "Drawer", "FloatingPanel", "Icon", "InlineError", "MenuSurface", "Modal", "PopoverChip", "Skeleton", "Spinner",
      "ToolbarDropdown", "ToolbarItem", "ToolbarSection", "ToolbarSegmentedControl", "tooltip", "useConfirm", "useDelayedFlag", "zIndex",
    ],
  },
} as const;

describe("public API", () => {
  for (const [entry, { load, names }] of Object.entries(SURFACE)) {
    it(`@pagehub/editor${entry === "index" ? "" : "/" + entry} exports exactly the curated names`, async () => {
      assert.deepEqual(Object.keys(await load()).sort(), [...names].sort());
    });
  }

  it("every default slot component is reachable from DEFAULT_COMPONENTS or the components entry", async () => {
    const { DEFAULT_COMPONENTS } = await SURFACE.index.load();
    const components = await SURFACE.components.load();
    const entryNames = new Set<unknown>(Object.values(components));
    for (const name of ["TopBar", "PageSelector", "Sidebar", "Inspector", "LayersPanel", "AddPanel", "ThemePanel", "ModifiersPanel", "CommandPalette", "ContextMenu", "SaveBanner", "SaveStatus", "EmptyState"] as const) {
      assert.ok(entryNames.has(DEFAULT_COMPONENTS[name]), `${name} is the same component in both`);
    }
  });
});
