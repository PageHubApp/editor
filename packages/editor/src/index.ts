/**
 * Public entry of @pagehub/editor: `<Editor>`, the components map, the React bindings and the canvas host
 * contract. The default slot components are `./components`, the building blocks for new panels are `./primitives`,
 * and the chrome stylesheet is `./styles.css`. Everything else is internal.
 */
export { Editor, mountEditor, type EditorProps } from "./Editor";
export { editorKit } from "./state/uiState";
export { aiChatFacet } from "./features/menus/aiChat";
export { emailEditorKit } from "./features/email/emailEditorKit";
export type { EditorEvent } from "./react/events";
export {
  Slot,
  useSlot,
  type ComponentsMap,
  type SlotName,
  type SlotProps,
  type NoProps,
  type InspectorSectionProps,
  type InspectorDetailProps,
  type ValuePickerProps,
  type FontPickerProps,
  type MediaManagerProps,
  type PanelProps,
  type CodeViewProps,
} from "./components";
export { DEFAULT_COMPONENTS } from "./shell/defaults";
export { useEditorStore, useEditorState, useRunCommand } from "./react/bindings";
export { useUi } from "./react/useUi";
export type { CanvasHost } from "./features/canvas/canvasHost";
export { defaultCanvasRender, type CanvasRender } from "./features/canvas/canvasContext";
