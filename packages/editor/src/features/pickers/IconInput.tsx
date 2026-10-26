/**
 * Icon row: the current icon (drawn from the catalogue) and its name; opens the `IconPicker`
 * slot beside the chip. `value` is a ref (`tb/TbPhone`); where it is stored is the caller's.
 *
 *   <IconInput label="Icon" value={ref} onChange={setRef} />
 */
import { iconCatalogueFacet } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { HtmlSpan } from "../../primitives/useStableHtml";
import { PickerChip, type PickerChipProps } from "./PickerChip";

type IconInputProps = Pick<PickerChipProps, "label" | "labelWidth" | "adornment" | "value" | "onChange">;

export function IconInput(p: IconInputProps) {
  const catalogue = useEditorState((s) => s.facet(iconCatalogueFacet));
  const svg = p.value ? catalogue?.svg(p.value) : null;
  return (
    <PickerChip
      {...p}
      slot="IconPicker"
      empty="Pick icon"
      clearLabel="Clear icon"
      summary={p.value.slice(p.value.indexOf("/") + 1)}
      leading={svg ? <HtmlSpan className="size-3.5 [&>svg]:size-full" data-icon-thumb="" html={svg} /> : <span className="block size-3.5 rounded-sm border border-dashed" aria-hidden />}
    />
  );
}
