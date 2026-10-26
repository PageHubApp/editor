/**
 * The inspector for the inspected element (default `Inspector` slot).
 *
 * - Nothing selected → the empty state. Otherwise the tabs stay mounted and only the element
 *   swaps.
 * - Tabs and sections come from the property map and the element's definition
 *   (`inspector: { type, sections, hide }`); the host's `inspectorTabs[type]` limits the tabs.
 *   The active tab is `ui.inspectorTab` (missing on this element → the first tab).
 * - Each section is an `InspectorSectionHost` (rows, "+", pin); pinned sections' rows live in
 *   the Pinned dock.
 * - Search (button or ⌘F → `sidebar.search`): the popup opens at the pointer; a query
 *   replaces the stack with "Results for "q"" (grouped by section, every accordion forced
 *   open without being persisted, matches highlighted).
 * - An element inside a partial, outside the component editor → no tab bar, the
 *   linked-instance bar instead.
 * - The tab bar's tools: collapse-all, search, the dark-variant toggle (`ui.dark`).
 * - A Liquid block with a panel (`for`, `if`, `section` …) → that panel (`LiquidBlockPanel`);
 *   a typed one (`{% form %}`) keeps its element tabs below it.
 */
import { useCallback, useMemo, useRef } from "react";
import { type NodeHandle } from "@pagehub/engine";
import { isRichTextLeaf } from "@pagehub/engine/kits";
import { useEditorState, useInspectedHandle, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { HIGHLIGHT_CSS, SearchPopup, searchPopupPosition, useSearchHighlight } from "./InspectorSearch";
import { InspectorIcon } from "./inspectorIcons";
import { glyphFor } from "../layers/glyphs";
import { rowIcon } from "../layers/layersKit";
import { InspectorTabs } from "./InspectorTabs";
import { inspectorConfigFacet } from "./inspectorState";

/** The Component tab's tooltip for an element kind. */
const KIND_LABELS: Readonly<Record<string, string>> = {
  text: "Text", heading: "Heading", image: "Image", video: "Video", audio: "Audio", embed: "Embed", button: "Button", link: "Link", icon: "Icon",
  form: "Form", "form-control": "Form field", container: "Container", map: "Map", "map-pin": "Map pin", "map-path": "Map route", background: "Background",
};
import { chromeOf } from "../../shell/chromeState";
import { inspectorLayout, type InspectorTabDef } from "./layout";
import { PinnedDock } from "./PinnedDock";
import { PinsProvider, usePins } from "./pins";
import { searchSections, sectionModel, type ElementView } from "./rowRules";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { AccordionProvider } from "../toolbar/AccordionContext";
import { useIndicatorDensityPersistence } from "../toolbar/breakpoint-chip/IndicatorDensityRow";
import { InspectorSectionHost } from "./InspectorSectionHost";
import { TextTopControls } from "./TextTopControls";
import { EmptyInspector, LinkedInstance, linkedPartial } from "./InspectorStates";
import { useElementView } from "./useElementView";
import { hasLiquidPanel, LiquidBlockPanel } from "../liquid/LiquidBlockPanel";
import { useInspectorActions, useInspectorUi } from "./useInspectorSession";

function SearchResults({ tabs, handle, view, query }: { tabs: readonly InspectorTabDef[]; handle: NodeHandle; view: ElementView; query: string }) {
  const root = useRef<HTMLDivElement>(null);
  const groups = searchSections(tabs.flatMap((t) => t.sections.map((s) => s.id)), view, query);
  useSearchHighlight(root, query);
  return (
    <div ref={root} data-inspector-results="" className="flex flex-col">
      <style>{HIGHLIGHT_CSS}</style>
      <div className="text-base-content/60 px-3 py-2 text-xs">{groups.length ? `Results for "${query}"` : `No results for "${query}"`}</div>
      {groups.map((g) => (
        <InspectorSectionHost key={g.id} id={g.id} handle={handle} view={view} mode="results" only={g.rows} />
      ))}
    </div>
  );
}

function Dock({ tabs, handle, view }: { tabs: readonly InspectorTabDef[]; handle: NodeHandle; view: ElementView }) {
  const { pins, togglePin } = usePins();
  const here = new Set(tabs.flatMap((t) => t.sections.map((s) => s.id)));
  const sections = pins
    .filter((id) => here.has(id) && !sectionModel(id, view).hidden)
    .map((id) => ({ id, title: sectionModel(id, view).title, body: <InspectorSectionHost id={id} handle={handle} view={view} mode="dock" /> }));
  return <PinnedDock sections={sections} onUnpin={togglePin} />;
}

function Tabs({ handle, view }: { handle: NodeHandle; view: ElementView }) {
  const active = useUi((u) => u.inspectorTab);
  const run = useRunCommand();
  const query = useInspectorUi((i) => i.query);
  const searchOpen = useEditorState((s) => chromeOf(s).sidebarSearch);
  const { set } = useInspectorActions();
  const config = useEditorState((s) => s.facet(inspectorConfigFacet));
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const tabIds = view.type ? config.inspectorTabs?.[view.type] : undefined;
  const titles = view.componentTitles;
  const allowed = config.sections;
  const layout = useMemo(() => {
    const all = inspectorLayout({ componentTitles: titles, ...(tabIds ? { tabs: tabIds } : {}) });
    if (!allowed) return all;
    // A host's section allowlist (the email profile): the Component tab's own sections always stay.
    const keep = (id: string) => id === "component" || id.startsWith("component:") || allowed.includes(id);
    return all.map((t) => ({ ...t, sections: t.sections.filter((s) => keep(s.id)) })).filter((t) => t.sections.length > 0);
  }, [titles, tabIds, allowed]);
  const tabs = layout.map((t) => {
    // a text leaf gets the Sample / Format / Edit HTML controls on top of the Component tab,
    // and its "Edit HTML" section folds into them (its text / richText rows are those controls)
    const textTop = t.id === "component" && view.type === "text" && isRichTextLeaf(handle);
    const sections = textTop ? t.sections.filter((s) => s.id !== "component:Edit HTML") : t.sections;
    return {
      id: t.id,
      // the Component tab is named after the element (its tooltip)
      title: t.id === "component" ? (view.type ? KIND_LABELS[view.type] ?? view.type : t.title) : t.title,
      // the Component tab wears the element's own glyph; the rest are fixed
      icon: t.id === "component" ? <Icon name={glyphFor(rowIcon(handle))} className="size-4" /> : <InspectorIcon name={t.icon} className="size-4" />,
      sectionTitles: sections.map((s) => sectionModel(s.id, view).title),
      content: (
        <>
          {textTop ? <TextTopControls handle={handle} /> : null}
          {sections.map((s) => (
            <InspectorSectionHost key={s.id} id={s.id} handle={handle} view={view} />
          ))}
        </>
      ),
    };
  });
  const close = useCallback(() => void (searchOpen && run("sidebar.search")), [searchOpen, run]);
  const searching = query.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onMouseMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}>
      <AccordionProvider forceOpen={searching}>
        <InspectorTabs
          tabs={tabs}
          active={active}
          onActiveChange={(id) => run("ui.set", { inspectorTab: id })}
          replace={searching ? <SearchResults tabs={layout} handle={handle} view={view} query={query} /> : undefined}
          tools={
            <button type="button" data-inspector-search-button="" onClick={() => run("sidebar.search")} aria-label="Search settings" aria-pressed={searchOpen} {...tooltip("Search settings (⌘F)", "top")} data-tooltip-offset={10} className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-[color,transform] active:scale-90 ${searchOpen ? "text-base-content" : "text-base-content/50 hover:text-base-content"}`}>
              <Icon name="search" className="size-4" />
            </button>
          }
        />
      </AccordionProvider>
      <Dock tabs={layout} handle={handle} view={view} />
      <SearchPopup open={searchOpen} at={pointer.current ? searchPopupPosition(pointer.current.x, pointer.current.y) : null} query={query} onQuery={(q) => set({ query: q })} onClose={close} />
    </div>
  );
}

export function Inspector() {
  useIndicatorDensityPersistence();
  const handle = useInspectedHandle();
  const view = useElementView(handle);
  const editing = useInspectorUi((i) => i.componentEditor);
  const linked = handle?.alive ? linkedPartial(handle, editing) : null;
  return (
    <div data-slot="Inspector" className="flex min-h-0 flex-1 flex-col">
      <PinsProvider>
        {!handle || !view ? (
          <EmptyInspector />
        ) : linked ? (
          <LinkedInstance handle={handle} name={linked} />
        ) : hasLiquidPanel(handle) ? (
          // a Liquid block's own panel; a typed one (`{% form %}`) keeps its element tabs below
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-liquid-inspector={handle.tag}>
            <LiquidBlockPanel handle={handle} />
            {view.type && <Tabs handle={handle} view={view} />}
          </div>
        ) : (
          <Tabs handle={handle} view={view} />
        )}
      </PinsProvider>
    </div>
  );
}
