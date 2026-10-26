/**
 * The inspector's tabs and sections, from the property map: tab order Component,
 * Interactions, Layout, Design, Advanced (inventory 3.2); each section lists the property keys
 * it holds. Image Settings is search-only, so it is not stacked. Pure data, no React.
 *
 *   inspectorLayout({ componentTitles: ["Playback", "Accessibility"], tabs: ["component", "design"] })
 *
 * The Component tab holds the element's own titled sections (definition `inspector.sections`),
 * then a "Component" section for its remaining rows, then Data source. `tabs` (the host's
 * `inspectorTabs` for the type) keeps only those tabs.
 */
import { SECTIONS } from "./rows/build";
import { componentSectionId, componentSectionRows } from "./rows/inspectorRows";
import { PROPERTY_MAP } from "../../property-map/propertyMap";
import type { PropEntry, Tab } from "./rows/types";
import type { InspectorIconName } from "./inspectorIcons";

interface InspectorSectionDef {
  id: string;
  title: string;
  entries: PropEntry[];
}

export interface InspectorTabDef {
  id: Tab;
  title: string;
  icon: InspectorIconName;
  sections: InspectorSectionDef[];
}

// The Component tab's icon is replaced per node type at render (the element's own glyph);
// the rest are fixed.
const INSPECTOR_TABS: ReadonlyArray<{ id: Tab; title: string; icon: InspectorIconName }> = [
  { id: "component", title: "Component", icon: "components" },
  { id: "interactions", title: "Interactions", icon: "mouse" },
  { id: "layout", title: "Layout", icon: "box-padding" },
  { id: "design", title: "Design", icon: "brush" },
  { id: "advanced", title: "Advanced", icon: "settings" },
];

/** Section order inside each tab (today's `sectionDefs.ts` sortOrder). */
const ORDER: Partial<Record<Tab, readonly string[]>> = {
  component: ["component", "data-source"],
  interactions: ["action", "handlers", "conditions", "stateBindings"],
  layout: ["preset-items", "modifiers", "alignment", "size"],
  design: ["typography", "background", "styles", "hover", "effects"],
  advanced: ["properties", "custom-css", "ai-context", "import-export", "permissions"],
};

export const SEARCH_ONLY_SECTIONS: ReadonlySet<string> = new Set(["image-settings"]);

interface LayoutOptions {
  componentTitles?: readonly string[];
  /** Tab ids to keep (host `inspectorTabs`). */
  tabs?: readonly string[];
}

/** Tabs with their sections; a section with no property is left out. */
export function inspectorLayout(opts: LayoutOptions = {}, entries: readonly PropEntry[] = PROPERTY_MAP): InspectorTabDef[] {
  const titles = opts.componentTitles ?? [];
  const component = (id: string): InspectorSectionDef => ({ id, title: id === "component" ? "Component" : id.slice(10), entries: componentSectionRows(id, titles).map((r) => r.entry) });
  return INSPECTOR_TABS.filter((t) => !opts.tabs || opts.tabs.includes(t.id)).map((t) => ({
    ...t,
    sections: [
      ...(t.id === "component" ? [...titles.map(componentSectionId), "component"].map(component) : []),
      ...(ORDER[t.id] ?? [])
        .filter((id) => id !== "component" && SECTIONS[id]?.[0] === t.id && !SEARCH_ONLY_SECTIONS.has(id))
        .map((id) => ({ id, title: SECTIONS[id]![1], entries: entries.filter((e) => e.section === id) })),
    ].filter((s) => s.entries.length > 0),
  }));
}
