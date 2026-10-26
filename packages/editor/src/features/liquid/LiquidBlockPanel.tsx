/**
 * The panel for a selected Liquid block or tag, rendered as one inspector section through
 * the `InspectorSection` slot: loops, conditions, `case`, `paginate`, `form`, `render` and
 * section settings (`{% section %}`). "Edit code" opens the block's source in the code view (absent when the `CodeView` slot is hidden, e.g. client role).
 *
 *   {hasLiquidPanel(h) && <LiquidBlockPanel handle={h} />}
 */
import { useState, type ComponentType } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { Slot, useSlot } from "../../components";
import { CasePanel, ConditionPanel, ForPanel, FormPanel, PaginatePanel, type BlockPanelProps } from "./BlockPanels";
import { RenderPanel } from "./PartialPanel";
import { Icon } from "../../primitives/icons";
import { CodeEditor } from "./CodeEditor";
import { SectionSettingsPanel } from "./SectionSettings";

const PANELS: Readonly<Record<string, { title: string; Panel: ComponentType<BlockPanelProps> }>> = {
  for: { title: "Repeat", Panel: ForPanel },
  if: { title: "Condition", Panel: ConditionPanel },
  unless: { title: "Condition", Panel: ConditionPanel },
  case: { title: "Case", Panel: CasePanel },
  paginate: { title: "Pagination", Panel: PaginatePanel },
  form: { title: "Form", Panel: FormPanel },
  render: { title: "Partial", Panel: RenderPanel },
  section: { title: "Section settings", Panel: SectionSettingsPanel },
};

/** Liquid tags with a panel. */
const LIQUID_PANEL_TAGS: ReadonlySet<string> = new Set(Object.keys(PANELS));

export const hasLiquidPanel = (h: NodeHandle | null): h is NodeHandle => !!h?.alive && (h.kind === "liquid-block" || h.kind === "liquid-tag") && LIQUID_PANEL_TAGS.has(h.tag);

export function LiquidBlockPanel({ handle }: { handle: NodeHandle }) {
  const [code, setCode] = useState(false);
  const codeView = useSlot("CodeView");
  const p = PANELS[handle.tag];
  if (!p) return null;
  return (
    <Slot name="InspectorSection" id={`liquid-${handle.tag}`} title={p.title}>
      <div className="flex flex-col gap-1.5 px-3 pb-2">
        <p.Panel handle={handle} />
        {codeView && <button type="button" aria-expanded={code} onClick={() => setCode(!code)} className="btn btn-xs btn-ghost text-base-content/70 hover:text-base-content gap-1 self-start text-[11px] font-normal" data-liquid-code-toggle="">
          <Icon name="code" className="size-3.5" />
          {code ? "Hide code" : "Edit code"}
        </button>}
        {codeView && code && <CodeEditor handle={handle} />}
      </div>
    </Slot>
  );
}
