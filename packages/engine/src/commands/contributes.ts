/**
 * Contributions: keybindings, menus, toolbar and palette entries as data pointing at
 * command ids. The shell renders them without loading plugin code; tooltips and menu
 * shortcuts are generated from the same bindings, so they can't drift.
 */
import type { Extension } from "../extensions/extension";
import { keybindingsFacet, menusFacet, paletteFacet, toolbarFacet } from "../extensions/facets";

export interface KeyBinding {
  command: string;
  key: string;
  /** `when` expression over the UI context (see when.ts). */
  when?: string;
  args?: unknown;
  /** macOS override of `key`. */
  mac?: string;
}

/** `canvas/context`, `layers/row`, `topbar`, … */
export type MenuSlot = string;

export interface MenuItem {
  command: string;
  /** `group` or `group@order`. */
  group?: string;
  when?: string;
}

export interface ToolbarItem extends MenuItem {
  icon: string;
}

export interface PaletteItem {
  command: string;
  when?: string;
  group?: string;
}

export interface Contributions {
  keybindings?: KeyBinding[];
  menus?: Record<MenuSlot, MenuItem[]>;
  toolbar?: ToolbarItem[];
  palette?: PaletteItem[];
}

export function contributes(c: Contributions): Extension {
  return [
    ...(c.keybindings ?? []).map((k) => keybindingsFacet.of(k)),
    ...(c.menus ? [menusFacet.of(c.menus)] : []),
    ...(c.toolbar ?? []).map((t) => toolbarFacet.of(t)),
    ...(c.palette ?? []).map((p) => paletteFacet.of(p)),
  ];
}
