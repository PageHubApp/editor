/**
 * One inspector row for a property-map row on the inspected element. The binding picks the
 * control: a class row is a `ToolbarItem` (classes.set through the property map), an attribute
 * row a text / toggle / select field (`attr.set`), a Liquid-argument row a field
 * (`liquid.setArg`); Conditions / Data source on an element are "Show only when…" / "Repeat
 * for each…" (the Liquid wrapper around it); any other row whose form is a structure shows
 * how it is written. Popover rows are a `PopoverChip` whose popover holds the control; the X
 * clears the value and keeps the row for the session.
 *
 *   <PropertyRow row={row} handle={h} visible />
 *
 * Popover rows always mount (an open request — "+", a header click — shows the popover even
 * while the chip itself is hidden).
 */
import { forwardRef, useRef, type ReactNode, type Ref, type RefObject } from "react";
import { groupTest, splitClass, type ClassGroup, type NodeHandle } from "@pagehub/engine";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { writeScopes } from "../../state/uiState";
import type { RowDef } from "./rows/inspectorRows";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { PopoverChip } from "../../primitives/Chip";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { controlSpecFor } from "./controlSpecs";
import { CHECKER_BG, isTranslucent } from "../pickers/colorValue";
import { ClassEditor } from "./ClassEditor";
import { ImportExportControl } from "./ImportExportControl";
import { EmbedCodeControl, IconValueControl } from "./componentRowControls";
import { filterIconOf, isImageIcon } from "./iconFilterHandle";
import { IconSizeControl } from "./controls/element/IconSizeControl";
import { SpecControl } from "./controls/SpecControl";
import { BgImageControl, ImageSrcControl } from "./controls/MediaControls";
import { BoundTextControl } from "./controls/BoundTextControl";
import { ScrollEffectControl } from "./controls/ScrollEffectControl";
import { AiNoteControl, PermissionsControl } from "./controls/EditMetaControls";
import { UniversalInput } from "../toolbar/UniversalInput";
import { ColorPanelControl, useColorBinding } from "../pickers/ColorInput";
import { useInspectorActions, useRowOpen } from "./useInspectorSession";
import { RepeatForEach } from "../liquid/ElementActions";
import { ConditionsEditor } from "./conditions/ConditionsEditor";
import { SectionEditor } from "./InspectorDetailView";
import { STATE_ROW_EDITORS } from "./state/stateEditors";
import { markupOf, wrapperOf, WRAPPER_ROWS } from "../liquid/markup";

function AttrField({ row, handle }: { row: RowDef; handle: NodeHandle }) {
  const run = useRunCommand();
  const raw = useEditorState(() => (handle.alive && handle.kind === "element" ? (handle.attr(row.attr!) ?? null) : null));
  const write = (v: string | null) => run("attr.set", { name: row.attr!, value: v, at: handle });
  const k = `${row.id}:${raw}`;
  const common = { label: row.label, inputId: `${row.id}` };
  if (row.kind === "boolean") return <ToolbarItemView key={k} {...common} type="toggle" on="on" value={raw === null ? "" : "on"} onChange={(v) => write(v ? "" : null)} />;
  if (row.kind === "enum")
    return <ToolbarItemView key={k} {...common} type="select" value={raw ?? ""} valueLabels={["", ...(row.options ?? [])]} onChange={(v) => write(v || null)} />;
  return <ToolbarItemView key={k} {...common} type={row.kind === "number" ? "number" : "text"} value={raw ?? ""} onChange={(v) => write(v === "" ? null : v)} />;
}

function ArgField({ row, handle }: { row: RowDef; handle: NodeHandle }) {
  const run = useRunCommand();
  const src = useEditorState(() => (handle.alive ? (handle.args().find((a) => a.name === row.arg)?.source ?? "") : ""));
  return <ToolbarItemView label={row.label} inputId={row.id} key={src} type="text" value={src} onChange={(v) => run("liquid.setArg", { name: row.arg!, value: v })} />;
}

function StructureNote({ row }: { row: RowDef }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs" data-row-structure="">
      <span className="text-base-content w-20 shrink-0 font-medium">{row.label}</span>
      <span className="text-base-content/60 min-w-0 flex-1">{row.entry.how}</span>
    </div>
  );
}

/**
 * The row's control, without the popover frame. A property with a `ControlSpec` renders its REAL
 * control (segmented picker, box-model editor, colour panel, multi-toggle, value field); the
 * `className` / attribute / argument / Liquid-wrapper rows keep their own controls; any other
 * single-group class property gets the universal value field (never a bare text box); only a row
 * with no workable control left falls back to a structure note.
 */
export function RowControl({ row, handle }: { row: RowDef; handle: NodeHandle }) {
  const hasGroup = useEditorState((s) => !!row.entry.group && s.facet(classGroupsFacet).has(row.entry.group));
  const spec = controlSpecFor(row.id);
  if (row.id === "bgImage" && handle.kind === "element") return <BgImageControl />;
  if (row.id === "image.src" && handle.kind === "element") return <ImageSrcControl handle={handle} />;
  if (row.id === "alt" && handle.kind === "element") return <BoundTextControl handle={handle} attr="alt" label={row.label} />;
  if (row.id === "scrollEffect" && handle.kind === "element") return <ScrollEffectControl handle={handle} />;
  if (row.id === "permissions" && handle.kind === "element") return <PermissionsControl handle={handle} />;
  if (row.id === "aiContext" && handle.kind === "element") return <AiNoteControl handle={handle} />;
  if (spec && handle.kind === "element") return <SpecControl spec={spec} row={row} handle={handle} />;
  if (row.id === "className" && handle.kind === "element")
    return (
      <ClassEditor handle={handle}>
        <AttrField row={row} handle={handle} />
      </ClassEditor>
    );
  // State wiring rows: structured editors over their `data-state-*` attributes (before the plain attribute field).
  if (row.id === "visibilityStateKey" && handle.kind === "element") return <ConditionsEditor handle={handle} browserOnly />;
  const State = STATE_ROW_EDITORS[row.id];
  if (State && handle.kind === "element") return <State handle={handle} />;
  if (row.attr && handle.kind === "element") return <AttrField row={row} handle={handle} />;
  if (row.arg && (handle.kind === "liquid-block" || handle.kind === "liquid-tag")) return <ArgField row={row} handle={handle} />;
  if (row.id === "conditions" && handle.kind === "element") return <ConditionsEditor handle={handle} />;
  // Action / Handlers as a row (search results, the pinned dock): the same editor as their section.
  if ((row.id === "action" || row.id === "handlers") && handle.kind === "element") return <SectionEditor kind={row.id} handle={handle} />;
  if (row.id === "dataSource" && handle.kind === "element") return <RepeatForEach handle={handle} />;
  if (row.id === "importExport" && handle.kind === "element") return <ImportExportControl handle={handle} />;
  if (row.id === "standalone-icon.value" && handle.kind === "element") return <IconValueControl handle={handle} row={row} />;
  if (row.id === "standalone-icon.size" && (filterIconOf(handle) || isImageIcon(handle))) return <IconSizeControl handle={handle} label={row.label} />;
  if (row.id === "code" && handle.kind === "element") return <EmbedCodeControl handle={handle} row={row} />;
  if (row.entry.home === "tailwind-class" && hasGroup && handle.kind === "element") return <UniversalInput prop={row.id} label={row.label} />;
  return <StructureNote row={row} />;
}

/** The State bindings chip's summary: which `data-state-*` wiring the element has. */
const STATE_SUMMARY: readonly (readonly [string, string])[] = [
  ["data-state-show", "Visibility"],
  ["data-state-class", "Classes"],
  ["data-state-bind", "Binding"],
  ["data-state-text", "Text"],
  ["data-state-compute", "Computed"],
  ["data-state-in-view", "In view"],
];

function summaryOf(row: RowDef, handle: NodeHandle, groups: ReadonlyMap<string, ClassGroup>, source: string): string {
  if (!handle.alive) return "";
  const wrapper = WRAPPER_ROWS[row.id] && handle.kind === "element" ? wrapperOf(handle, WRAPPER_ROWS[row.id]!) : null;
  if (wrapper) return markupOf(source, wrapper);
  if (row.id === "stateBindings" && handle.kind === "element") return STATE_SUMMARY.filter(([a]) => handle.attr(a) != null).map(([, label]) => label).join(", ");
  if (row.attr && handle.kind === "element") return handle.attr(row.attr) ?? "";
  if (row.arg) return handle.args().find((a) => a.name === row.arg)?.source ?? "";
  if (handle.kind !== "element") return "";
  const tests = row.groups.map((g) => groups.get(g)).filter((g): g is ClassGroup => !!g).map(groupTest);
  return handle.classes().filter((c) => tests.some((t) => t(splitClass(c)[1]))).join(" ");
}

/** A popover row's trigger when the property is a colour: the swatch preview chip. */
const ColorPopoverChip = forwardRef<HTMLButtonElement, { prop: string; label: string; open: boolean; onToggle(): void; onClear(): void; adornment?: ReactNode }>(
  function ColorPopoverChip({ prop, label, open, onToggle, onClear, adornment }, ref) {
    const binding = useColorBinding(prop);
    const has = !!binding && binding.value !== "";
    return (
      <PopoverChip
        ref={ref}
        label={label}
        open={open}
        adornment={adornment}
        onTriggerClick={onToggle}
        onClear={onClear}
        triggerAriaLabel={has ? `Edit ${label}` : `Pick ${label}`}
        clearAriaLabel={`Clear ${label}`}
        variant={has ? "preview" : "default"}
        leading={
          has ? (
            <>
              {isTranslucent(binding!.value) && <span className="pointer-events-none absolute inset-0 z-0" style={CHECKER_BG} aria-hidden />}
              <span className="pointer-events-none absolute inset-0 z-[1]" style={{ backgroundColor: binding!.css }} aria-hidden />
            </>
          ) : (
            <span className="block size-3.5 rounded-sm border" style={{ ...CHECKER_BG, borderColor: "var(--base-300)" }} aria-hidden />
          )
        }
        summary={has ? null : <span className="text-base-content/50">Pick color</span>}
      />
    );
  }
);

/** Rows whose editor holds nested condition cards: a wider popover so key / value fields stay readable. */
const WIDE_POPOVERS: ReadonlySet<string> = new Set(["conditions", "stateBindings", "visibilityStateKey", "stateModifiers", "computedStateBindings", "inViewState", "scrollEffect"]);

/** Tallest a row popover grows; it also shrinks to the room left on the side it flips to, and scrolls inside. */
const POPOVER_MAX_HEIGHT = 640;

function PopoverRow({ row, handle, visible }: { row: RowDef; handle: NodeHandle; visible: boolean }) {
  const anchor = useRef<HTMLButtonElement | HTMLSpanElement | null>(null);
  const open = useRowOpen(handle, row.id);
  const { openRow, addRows } = useInspectorActions();
  const run = useRunCommand();
  const ui = useUi((u) => u);
  const isColor = controlSpecFor(row.id)?.kind === "color";
  const summary = useEditorState((s) => summaryOf(row, handle, s.facet(classGroupsFacet), s.files.get(handle.path) ?? ""));
  const clear = () => {
    if (row.attr) run("attr.set", { name: row.attr, value: null, at: handle });
    else if (row.arg) run("liquid.setArg", { name: row.arg, value: "" });
    else for (const group of row.groups) run("classes.set", { group, token: null, scopes: writeScopes(ui, row.entry.variant === "hover" ? "hover" : undefined), at: handle });
    addRows(handle, [row.id]);
  };
  const toggle = () => openRow(handle, open ? null : row.id);
  return (
    <div data-row={row.id} data-row-popover="" className={visible ? "" : "contents"}>
      {visible ? (
        isColor ? (
          <ColorPopoverChip ref={anchor as Ref<HTMLButtonElement>} prop={row.id} label={row.label} open={open} onToggle={toggle} onClear={clear} />
        ) : (
          <PopoverChip
            ref={anchor as Ref<HTMLButtonElement>}
            label={row.label}
            open={open}
            summary={summary || <span className="text-base-content/50">Add…</span>}
            onTriggerClick={toggle}
            onClear={clear}
            triggerAriaLabel={`Edit ${row.label}`}
            clearAriaLabel={`Clear ${row.label}`}
          />
        )
      ) : (
        <span ref={anchor as Ref<HTMLSpanElement>} aria-hidden className="block h-0 w-full" />
      )}
      <AnchoredPopover open={open} onOpenChange={(o) => !o && openRow(null, null)} anchor={anchor as RefObject<HTMLElement | null>} immediate maxHeightCeiling={POPOVER_MAX_HEIGHT} className="flex flex-col">
        <div className={`bg-base-100 border-base-300 grid min-h-0 ${WIDE_POPOVERS.has(row.id) ? "w-80" : "w-64"} gap-2 overflow-y-auto overscroll-contain rounded-xl border p-3 shadow-xl`} data-row-popover-body={row.id}>
          {isColor ? <ColorPanelControl prop={row.id} /> : <RowControl row={row} handle={handle} />}
        </div>
      </AnchoredPopover>
    </div>
  );
}

export function PropertyRow({ row, handle, visible }: { row: RowDef; handle: NodeHandle; visible: boolean }) {
  if (row.popover) return <PopoverRow row={row} handle={handle} visible={visible} />;
  if (!visible) return null;
  return (
    <div data-row={row.id} className="min-w-0">
      <RowControl row={row} handle={handle} />
    </div>
  );
}
