/**
 * `@pagehub/editor/primitives`: the building blocks a host needs to make its own panel look native
 * (a payments picker, an AI panel): overlays, chips, toolbar controls, menus, loading and error states, icons, tooltips.
 */
export { Modal, type ModalProps, type ModalSize, type ModalVariant } from "./primitives/Modal";
export { ConfirmDialog, useConfirm, type ConfirmDialogProps, type ConfirmOptions, type ConfirmVariant } from "./primitives/ConfirmDialog";
export { Drawer, type DrawerProps } from "./primitives/Drawer";
export { FloatingPanel, type FloatingPanelProps } from "./primitives/FloatingPanel";
export { AnchoredPopover, type AnchoredPopoverProps } from "./primitives/AnchoredPopover";
export { Chip, PopoverChip, type ChipProps, type PopoverChipProps } from "./primitives/Chip";
export { ToolbarItem, type ToolbarItemProps } from "./features/toolbar/ToolbarItem";
export { ToolbarSection, type ToolbarSectionProps } from "./features/toolbar/ToolbarSection";
export { ToolbarDropdown, type ToolbarDropdownProps } from "./features/toolbar/ToolbarDropdown";
export { ToolbarSegmentedControl, type ToolbarSegmentedControlProps, type ToolbarSegmentedOption } from "./features/toolbar/primitives/ToolbarSegmentedControl";
export { MenuSurface, type MenuSurfaceProps } from "./features/menus/MenuSurface";
export { Skeleton } from "./primitives/Skeleton";
export { Spinner } from "./primitives/Spinner";
export { InlineError } from "./primitives/InlineError";
export { useDelayedFlag } from "./primitives/useDelayedFlag";
export { Icon, type IconName } from "./primitives/icons";
export { tooltip } from "./primitives/tooltip";
export * as zIndex from "./primitives/zIndex";
