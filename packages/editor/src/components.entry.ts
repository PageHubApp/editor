/**
 * `@pagehub/editor/components`: the default slot components, for wrapping or re-composing
 * (`components={{ Inspector: MyInspector }}` around `<Inspector/>`). The full set is also `DEFAULT_COMPONENTS`.
 */
export { TopBar } from "./features/topbar/TopBar";
export { PageSelector } from "./features/topbar/PageSelector";
export { Sidebar } from "./shell/Sidebar";
export { EditorSkeleton } from "./shell/EditorSkeleton";
export { Inspector } from "./features/inspector/Inspector";
export { InspectorSectionView } from "./features/inspector/InspectorSectionView";
export { LayersPanel } from "./features/layers/LayersPanel";
export { AddPanel } from "./features/add/AddPanel";
export { Viewport } from "./features/canvas/Viewport";
export { Board } from "./features/board/Board";
export { MediaManager } from "./features/media/MediaManager";
export { ThemePanel, type ThemePanelProps } from "./features/theme/ThemePanel";
export { ScriptsPanel } from "./features/scripts/ScriptsPanel";
export { ModifiersPanel, type ModifiersPanelProps } from "./features/modifiers/ModifiersPanel";
export { CommandPalette } from "./features/palette/CommandPalette";
export { ContextMenu } from "./features/menus/ContextMenu";
export { CodeMirrorView, type CodeMirrorViewProps } from "./features/code/CodeMirrorView";
export { DiffPreview } from "./features/diff/DiffPreview";
export { SaveBanner } from "./features/save/SaveBanner";
export { SaveStatus } from "./features/save/SaveStatus";
export { EmptyState } from "./features/empty-state/EmptyState";
export { ColorPicker } from "./features/pickers/ColorPicker";
export { IconPicker } from "./features/pickers/IconPicker";
export { FontPicker } from "./features/pickers/FontPicker";
