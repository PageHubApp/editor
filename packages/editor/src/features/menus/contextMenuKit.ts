/**
 * The canvas context menu's own contributions: the Insert ▸ rows (`4_insert`: Add block above /
 * below, Insert component ▸, Add empty section, Add container). The menu order is groups
 * `1_selection | 2_clipboard | 3_navigate | 4_insert (a submenu) | 5_edit`, then the host's AI row.
 */
import { commandsFacet, contributes, defineCommand, type Extension } from "@pagehub/engine";

const CANVAS_TARGETS: ReadonlySet<string> = new Set(["html.section", "html.container"]);
const SECTION_ONLY: ReadonlySet<string> = new Set(["html.section"]);

type Selected = { alive: boolean; kind: string; element?: { name: string } } | null;
const isElement = (h: Selected, names: ReadonlySet<string>): boolean => !!h?.alive && h.kind === "element" && !!h.element && names.has(h.element.name);
/** True for a section or container: what "Insert component ▸" and "Add container" append into (a text, image or other leaf element can't hold one). */
const isCanvasTarget = (h: Selected): boolean => isElement(h, CANVAS_TARGETS);

/** Insert rows offered only on some elements (their `when`): the rest never show a row. */
const INSERT_ROW_TARGETS: Record<string, ReadonlySet<string>> = {
  "insert.blockAbove": SECTION_ONLY,
  "insert.blockBelow": SECTION_ONLY,
  "insert.component": CANVAS_TARGETS,
  "element.addContainer": CANVAS_TARGETS,
};
/** False when the selection is an element this Insert row is not offered on (any other row: true). */
export const insertRowApplies = (command: string, h: Selected): boolean => !INSERT_ROW_TARGETS[command] || isElement(h, INSERT_ROW_TARGETS[command]!);

/** Opens the Add panel's components tab; runnable on a section, container or page (the flyout's targets). */
const insertComponentMenu = defineCommand({
  id: "insert.component",
  title: "Insert component",
  run(ctx) {
    if (!isCanvasTarget(ctx.selection.primary as Selected)) return false;
    return !!ctx.state.facet(commandsFacet).get("insert.open")?.run(ctx, { tab: "components" });
  },
});

export const CONTEXT_MENU_KIT: Extension = [
  insertComponentMenu,
  contributes({
    menus: {
      "canvas/context": [
        { command: "insert.blockAbove", group: "4_insert@1" },
        { command: "insert.blockBelow", group: "4_insert@2" },
        { command: "insert.component", group: "4_insert@3" },
        { command: "element.addSection", group: "4_insert@4" },
        { command: "element.addContainer", group: "4_insert@5" },
      ],
    },
  }),
];
