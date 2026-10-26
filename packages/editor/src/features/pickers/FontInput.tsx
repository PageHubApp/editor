/**
 * Font row: the family set in its own face; opens the `FontPicker` slot under the chip.
 * `value` is a family name; `onPreview` shows a hovered family on the element being edited.
 *
 *   <FontInput label="Heading font" value="Inter" onChange={setFamily} />
 */
import { PickerChip, type PickerChipProps } from "./PickerChip";

type FontInputProps = Pick<PickerChipProps, "label" | "labelWidth" | "adornment" | "value" | "onChange" | "onPreview">;

export function FontInput(p: FontInputProps) {
  return <PickerChip {...p} slot="FontPicker" empty="Pick font" clearLabel="Clear font" summary={p.value} leading={<span className="text-xs font-semibold" style={{ fontFamily: `"${p.value}"` }}>Aa</span>} />;
}
