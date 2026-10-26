/**
 * The components map: every visible piece of the editor is a named slot. A host replaces any
 * slot with its own component, or hides it with `null`, without forking:
 *
 *   <Editor editor={editor} components={{ Toolbar: MyToolbar, LayersPanel: null }} />
 *
 * Defaults are the editor's own UI (`shell/defaults.tsx`); each slot's props type is exported.
 */
import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { MediaKind } from "@pagehub/engine/host";
import type { LiquidCompletions } from "./features/code/CodeMirrorView";
import type { MediaSource } from "./features/media/MediaManagerView";
import type { ViewDiagnostic } from "./features/code/viewDiagnostics";
import type { DetailKind } from "./shell/chromeState";

export interface NoProps {}

export interface InspectorSectionProps {
  title: string;
  /** Property-map keys shown inside; drives the section override dot. */
  props?: readonly string[];
  children?: ReactNode;
  /** Section id (`data-section-id`). */
  id?: string;
  /** Header actions (pin, "+"). */
  actions?: ReactNode;
  /** Header dimmed, no body (nothing visible yet); a header click still reaches `onHeaderClick`. */
  disabled?: boolean;
  /** False: header only (a popover-only section). */
  collapsible?: boolean;
  onHeaderClick?(e: { preventDefault(): void }): void;
}
export interface ValuePickerProps<T = string> {
  value: T;
  onChange(value: T): void;
  onClose?(): void;
  /** The trigger the panel opens beside. */
  anchor?: HTMLElement | null;
}
export interface FontPickerProps extends ValuePickerProps {
  /** Show a family on the element being edited; `null` restores the stored one. */
  onPreview?(family: string | null): void;
  /** Stacking order; raise it above an enclosing floating panel (default `Z_ANCHORED`). */
  zIndex?: number;
}
export interface MediaManagerProps {
  open: boolean;
  onClose(): void;
  onPick?(mediaId: string): void;
  /** Pre-select a kind in the toolbar filter (a video picker shows videos). */
  kindFilter?: MediaKind;
  sources?: readonly MediaSource[];
  /** Render the manager body without its own floating-panel frame — the host (the right drawer) frames it. */
  chromeless?: boolean;
}
export interface CodeViewProps {
  value: string;
  onChange(value: string): void;
  language?: "html" | "css" | "javascript" | "js" | "liquid";
  placeholder?: string;
  /** The text field's accessible name. Default: "<language> code". */
  label?: string;
  minHeight?: string;
  maxHeight?: string;
  /** Marks to draw, in offsets of `value` (see `viewDiagnostics`). */
  diagnostics?: readonly ViewDiagnostic[];
  /** Liquid completions (the manifest's tags and filters, the names in scope). */
  completions?: LiquidCompletions;
  /** ⌘S / Ctrl+S inside the view. */
  onSave?(value: string): void;
}
export interface PanelProps {
  open: boolean;
  onClose(): void;
}
export interface InspectorDetailProps extends PanelProps {
  /** Which complex editor the drawer shows for the inspected node. */
  kind: DetailKind;
}

/** Slot name → props its component receives. */
export interface SlotProps {
  TopBar: NoProps;
  PageSelector: NoProps;
  BreakpointSwitcher: NoProps;
  SaveStatus: NoProps;
  Sidebar: NoProps;
  AddPanel: NoProps;
  LayersPanel: NoProps;
  Inspector: NoProps;
  InspectorSection: InspectorSectionProps;
  Breadcrumb: NoProps;
  Canvas: NoProps;
  /** The component board, shown in the canvas column while the components editor is open. */
  ComponentBoard: NoProps;
  CanvasOverlays: NoProps;
  NodeTools: NoProps;
  InlineTextToolbar: NoProps;
  ContextMenu: NoProps;
  CommandPalette: NoProps;
  MediaManager: MediaManagerProps;
  ThemePanel: PanelProps;
  ModifiersPanel: PanelProps;
  ScriptsPanel: PanelProps;
  InspectorDetail: InspectorDetailProps;
  ColorPicker: ValuePickerProps;
  IconPicker: ValuePickerProps;
  FontPicker: FontPickerProps;
  CodeView: CodeViewProps;
  DiffPreview: NoProps;
  SaveBanner: NoProps;
  EmptyState: NoProps;
}

export type SlotName = keyof SlotProps;
export type ComponentsMap = { [K in SlotName]: ComponentType<SlotProps[K]> | null };

/** `overrides` replacing slots that exist in `defaults` (a full map). TypeScript already rejects unknown keys; this check is for JS hosts. */
export function resolveComponents(defaults: ComponentsMap, overrides: Partial<ComponentsMap> = {}): ComponentsMap {
  for (const k of Object.keys(overrides)) if (!Object.hasOwn(defaults, k)) throw new Error(`unknown editor slot "${k}"`);
  return { ...defaults, ...overrides };
}

const ComponentsContext = createContext<ComponentsMap | null>(null);
export const ComponentsProvider = ComponentsContext.Provider;

/** The component in a slot, or null when the host hid it. */
export function useSlot<K extends SlotName>(name: K): ComponentType<SlotProps[K]> | null {
  const map = useContext(ComponentsContext);
  if (!map) throw new Error(`useSlot("${name}") must be used inside <Editor>`);
  return map[name];
}

/** Render a slot (nothing when hidden). */
export function Slot<K extends SlotName>(props: { name: K } & SlotProps[K]): ReactNode {
  const { name, ...rest } = props;
  const C = useSlot(name);
  return C ? createElement(C as ComponentType<any>, rest) : null;
}
