/**
 * Default slot components. The shell pieces (`Sidebar`, `TopBar`; `Canvas` is the viewport) carry today's
 * Default arrangement: save banner on top; the settings sidebar (top bar, breadcrumb, Add
 * drawer, inspector, docked layers) beside the canvas column.
 */
import type { ComponentsMap, SlotName } from "../components";
import { CodeMirrorView } from "../features/code/CodeMirrorView";
import { DiffPreview } from "../features/diff/DiffPreview";
import { RichTextLayer } from "../features/richtext/RichTextLayer";
import { LayersPanel } from "../features/layers/LayersPanel";
import { FontPicker } from "../features/pickers/FontPicker";
import { IconPicker } from "../features/pickers/IconPicker";
import { ColorPicker } from "../features/pickers/ColorPicker";
import { ThemePanel } from "../features/theme/ThemePanel";
import { ModifiersPanel } from "../features/modifiers/ModifiersPanel";
import { ScriptsPanel } from "../features/scripts/ScriptsPanel";
import { InspectorDetailView } from "../features/inspector/InspectorDetailView";
import { Inspector } from "../features/inspector/Inspector";
import { CommandPalette } from "../features/palette/CommandPalette";
import { ContextMenu } from "../features/menus/ContextMenu";
import { InspectorSectionView } from "../features/inspector/InspectorSectionView";
import { Viewport } from "../features/canvas/Viewport";
import { Board } from "../features/board/Board";
import { CanvasOverlays } from "../features/canvas/CanvasOverlays";
import { NodeTools } from "../features/canvas/NodeTools";
import { BreakpointSwitcher } from "../features/canvas/BreakpointSwitcher";
import { Breadcrumb } from "../features/canvas/Breadcrumb";
import { Sidebar } from "./Sidebar";
import { AddPanel } from "../features/add/AddPanel";
import { TopBar } from "../features/topbar/TopBar";
import { PageSelector } from "../features/topbar/PageSelector";
import { SaveStatus } from "../features/save/SaveStatus";
import { SaveBanner } from "../features/save/SaveBanner";
import { EmptyState } from "../features/empty-state/EmptyState";

export const DEFAULT_COMPONENTS: ComponentsMap = {
  TopBar,
  PageSelector,
  BreakpointSwitcher,
  SaveStatus,
  Sidebar,
  AddPanel,
  LayersPanel,
  Inspector,
  InspectorSection: InspectorSectionView,
  Breadcrumb,
  Canvas: Viewport,
  ComponentBoard: Board,
  CanvasOverlays,
  NodeTools,
  InlineTextToolbar: RichTextLayer,
  ContextMenu,
  CommandPalette,
  // No media manager in the open-source core — a host injects the real, facet-wired one
  // (`connectors/media/MediaManager`). A null slot renders nothing; the two consumers
  // (`MediaInput`, the right drawer's `media` panel) stay inert when it is absent.
  MediaManager: null,
  ThemePanel,
  ModifiersPanel,
  ScriptsPanel,
  InspectorDetail: InspectorDetailView,
  ColorPicker,
  IconPicker,
  FontPicker,
  CodeView: CodeMirrorView,
  DiffPreview,
  SaveBanner,
  EmptyState,
};

/** Every slot, in the order of `DEFAULT_COMPONENTS` (the map is complete by type, so this cannot drift from it). */
export const SLOT_NAMES = Object.keys(DEFAULT_COMPONENTS) as SlotName[];
