/**
 * The chrome's stacking ladder. Every overlay picks one of these; nothing hard-codes a z-index.
 * Only the rungs in use are listed; add new ones here so mixed surfaces keep their order.
 */
/** AnchoredPopover default (selects, pickers, searchable menus, the chip popover). */
export const Z_ANCHORED = 60;
/** Centered / drawer / sheet modals. */
export const Z_MODAL = 70;
/** Headless UI select lists (ToolbarDropdown). */
export const Z_TOOLBAR_DROPDOWN = 80;
/** Right-click menus (the breakpoint chip menu). */
export const Z_MENU = 90;
/** FloatingPanel default and the floating editors (colour, var picker). */
export const Z_FLOATING_PANEL = 999;
export const Z_FLOATING_EDITOR = 1100;
/** A field's option list (autocomplete, value-type menu): above whatever popover or panel holds the field. */
export const Z_LISTBOX = 1150;
/** Confirm dialogs: above every panel, including the floating editors. */
export const Z_CONFIRM = 9997;
/** The command palette: above every panel, below confirm dialogs. */
export const Z_PALETTE = 9990;
