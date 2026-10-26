/**
 * One inspector section for the inspected element: its model (`sectionModel`), its rows, the
 * pin button and the "+" picker, rendered through the `InspectorSection` slot.
 *
 *   <InspectorSectionHost id="size" handle={h} view={view} mode="stack" />
 *
 * `mode`: `stack` (the tab scroll; a pinned section shows a note instead of its rows),
 * `dock` (the Pinned dock: rows only), `results` (search: the matching rows, every one shown).
 *
 * Adding from "+": a row with a default writes it; every added row stays for the session in
 * click order; the section opens; adding exactly one popover row opens its popover on the next
 * frame (adding several opens none).
 */
import { useRef } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { Slot } from "../../components";
import { useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { writeScopes } from "../../state/uiState";
import type { RowDef } from "./rows/inspectorRows";
import { AddPropertyMenu, type AddPropertyMenuHandle } from "./AddPropertyMenu";
import { SectionPinButton, usePins } from "./pins";
import { sectionModel, type ElementView } from "./rowRules";
import { useAccordion } from "../toolbar/AccordionContext";
import { PropertyRow } from "./PropertyRow";
import { ElementControlRow, elementControlFor } from "./controls/elementControls";
import { ModifiersEditor } from "./ModifiersEditor";
import { SectionEditor, type SectionEditorKind } from "./InspectorDetailView";
import { useAddedRows, useInspectorActions } from "./useInspectorSession";

type SectionMode = "stack" | "dock" | "results";

/** Sections whose body is one whole editor (not property rows), rendered inline under the header. */
const INLINE_EDITOR_SECTIONS: Record<string, SectionEditorKind> = {
  conditions: "conditions",
  "data-source": "dataSource",
  action: "action",
  handlers: "handlers",
};

const PinnedNote = () => (
  <div data-pinned-note="" className="text-base-content/60 border-base-300/60 border-t border-dashed px-3 py-2 text-xs italic">
    Properties for this section are pinned below.
  </div>
);

interface InspectorSectionHostProps {
  id: string;
  handle: NodeHandle;
  view: ElementView;
  mode?: SectionMode;
  /** `results`: the matching rows. */
  only?: readonly RowDef[];
}

export function InspectorSectionHost({ id, handle, view, mode = "stack", only }: InspectorSectionHostProps) {
  const added = useAddedRows(handle);
  const model = sectionModel(id, view, added);
  const { isPinned } = usePins();
  const { addRows, openRow } = useInspectorActions();
  const accordion = useAccordion();
  const run = useRunCommand();
  const ui = useUi((u) => u);
  const menu = useRef<AddPropertyMenuHandle>(null);
  if (model.hidden) return null;

  const results = mode === "results";

  // Modifiers keeps its dedicated editor inline (style-modifier presets, ph-mod-* classes). Action /
  // Handlers / Conditions / Data source are big enough to earn the right drawer (see DRAWER_SECTIONS).
  // Search ('results') keeps the row chips so matches still highlight.
  const detailBody = !results && handle.kind === "element" && id === "modifiers" ? <ModifiersEditor handle={handle} /> : null;
  if (detailBody) {
    if (mode === "dock") return <>{detailBody}</>;
    return (
      <Slot
        name="InspectorSection"
        id={id}
        title={model.title}
        props={model.rows.filter((r) => r.entry.home === "tailwind-class").map((r) => r.id)}
        collapsible
        actions={<SectionPinButton sectionId={id} hidden={false} />}
      >
        {detailBody}
      </Slot>
    );
  }

  const visible = results ? (only ?? []) : model.visible;
  const mounted = results ? visible : [...visible, ...model.rows.filter((r) => r.popover && !visible.includes(r))];
  const rows = mounted.map((r) => {
    // A per-element Component control (Button Type, Button / Link Text) that the generic row
    // controls can't express renders through `ElementControlRow`; everything else is a PropertyRow.
    const Control = elementControlFor(r.id, handle);
    if (Control) return <ElementControlRow key={r.id} row={r} handle={handle} visible={visible.includes(r)} Control={Control} />;
    return <PropertyRow key={r.id} row={r} handle={handle} visible={visible.includes(r)} />;
  });
  if (mode === "dock") return <>{rows}</>;

  // The element's own primary settings (Button Text/Icon/Type, an input's Type/Value, …) are the
  // catch-all "component" section. The live editor shows them always, at the top of the Component
  // tab — never inside a collapsible "Component" accordion the user can close and lose track of.
  // Render them bare (no header), mirroring ToolbarSection's body styling. Named component
  // sub-sections (`component:…`) and search results keep their accordion.
  if (id === "component" && !results) {
    return (
      <div data-slot="InspectorSection" data-section-id={id} className="border-base-300/60 bg-base-100 text-base-content grid items-end gap-3 border-b p-3">
        {rows}
      </div>
    );
  }

  // Action / Handlers / Conditions / Data source: the full editor IS the section body, opening under
  // its header like any other section. A dot on the header shows when the element has a value.
  const editorKind = !results ? INLINE_EDITOR_SECTIONS[id] : undefined;
  if (editorKind) {
    // The element has a value for this editor: a set condition / binding (popover-only sections), or
    // one or more existing actions / handlers (their visible rows).
    const set = model.popoverOnly ? view.hasValue(model.popoverOnly) : model.visible.length > 0;
    return (
      <Slot
        name="InspectorSection"
        id={id}
        title={model.title}
        collapsible
        actions={
          <>
            {set && <span data-section-set="" className="bg-primary size-1.5 rounded-full" aria-label={`${model.title} set`} />}
            <SectionPinButton sectionId={id} hidden={false} />
          </>
        }
      >
        {mode === "stack" && isPinned(id) ? <PinnedNote /> : <SectionEditor kind={editorKind} handle={handle} />}
      </Slot>
    );
  }

  const add = (picked: RowDef[]) => {
    for (const r of picked) {
      if (r.defaultValue === undefined) continue;
      if (r.attr) run("attr.set", { name: r.attr, value: r.defaultValue, at: handle });
      else if (r.entry.group) run("classes.set", { group: r.entry.group, token: r.defaultValue, scopes: writeScopes(ui), at: handle });
    }
    addRows(handle, picked.map((r) => r.id));
    accordion?.setOpen(model.title, true);
    const one = picked.length === 1 && picked[0]!.popover ? picked[0]! : null;
    if (one) requestAnimationFrame(() => openRow(handle, one.id));
  };
  const openPopover = (r: RowDef) => {
    accordion?.setOpen(model.title, true);
    openRow(handle, r.id);
  };

  const pinned = mode === "stack" && isPinned(id);
  const empty = !results && !model.inline && model.visible.length === 0;
  const popoverOnly = !results && model.popoverOnly;
  // A popover-only section (Action, Conditions …) shows ONE add affordance: the "+" picker while
  // empty, and its value chip (edit / clear) once set — never both.
  const popoverSet = !!popoverOnly && view.hasValue(popoverOnly);
  return (
    <>
      <Slot
        name="InspectorSection"
        id={id}
        title={model.title}
        props={model.rows.filter((r) => r.entry.home === "tailwind-class").map((r) => r.id)}
        collapsible={!popoverOnly}
        disabled={empty && !popoverOnly}
        onHeaderClick={(e) => {
          if (popoverOnly) {
            e.preventDefault();
            openPopover(popoverOnly);
          } else if (empty) {
            e.preventDefault();
            menu.current?.open();
          }
        }}
        actions={
          <>
            <SectionPinButton sectionId={id} hidden={results} />
            {results ? null : popoverSet ? (
              rows
            ) : popoverOnly ? (
              // an empty popover-only section: the "+" opens its editor (never shows the value chip)
              <AddPropertyMenu ref={menu} candidates={[popoverOnly]} onAdd={add} onOpenPopover={openPopover} />
            ) : (
              !model.inline && <AddPropertyMenu ref={menu} candidates={model.candidates} onAdd={add} onOpenPopover={openPopover} />
            )}
          </>
        }
      >
        {popoverOnly ? null : pinned ? (
          <PinnedNote />
        ) : (
          rows
        )}
      </Slot>
      {/* An empty popover-only section shows just the "+" (no value chip), but its popover body must
          still mount so a header click / the "+" can open the editor. Mount it hidden (no chip). */}
      {popoverOnly && !popoverSet && <PropertyRow row={popoverOnly} handle={handle} visible={false} />}
    </>
  );
}
