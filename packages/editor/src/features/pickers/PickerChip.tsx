/**
 * A row whose value is picked in a slot (icon, font): the chip shows the current value, the
 * slot opens beside it, the X clears. `onChange` fires on every pick; the caller decides what a
 * value writes.
 *
 *   <PickerChip slot="IconPicker" label="Icon" value="tb/TbPhone" onChange={set} leading={<Svg />} />
 */
import { useRef, useState, type ReactNode } from "react";
import { Slot } from "../../components";
import { PopoverChip } from "../../primitives/Chip";

export interface PickerChipProps {
  slot: "IconPicker" | "FontPicker";
  label?: string;
  labelWidth?: string;
  adornment?: ReactNode;
  value: string;
  onChange(value: string): void;
  /** Icon / swatch before the summary. */
  leading?: ReactNode;
  /** Chip text for the current value. */
  summary: string;
  empty: string;
  clearLabel: string;
  /** `FontPicker`: show a hovered family on the element being edited. */
  onPreview?(family: string | null): void;
}

export function PickerChip({ slot, label, labelWidth, adornment, value, onChange, leading, summary, empty, clearLabel, onPreview }: PickerChipProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PopoverChip
        ref={trigger}
        label={label}
        labelWidth={labelWidth}
        adornment={adornment}
        open={open}
        onTriggerClick={() => setOpen((o) => !o)}
        onClear={() => (setOpen(false), onChange(""))}
        triggerAriaLabel={value ? `Change ${empty.toLowerCase().replace(/^pick /, "")}` : empty}
        clearAriaLabel={clearLabel}
        leading={leading}
        summary={value ? summary : empty}
      />
      {open && <Slot name={slot} value={value} onChange={onChange} onClose={() => setOpen(false)} anchor={trigger.current} {...{ onPreview }} />}
    </>
  );
}
