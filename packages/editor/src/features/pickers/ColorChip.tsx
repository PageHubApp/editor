// Presentational part only; state lives in connectors/pickers/ColorInput.tsx.
/**
 * The colour row: a full-bleed swatch preview (checkerboard behind a translucent colour) when a
 * colour is stored, else "Pick color"; the X clears.
 */
import { forwardRef, type ReactNode } from "react";
import { PopoverChip } from "../../primitives/Chip";
import { CHECKER_BG, isTranslucent } from "./colorValue";

interface ColorChipProps {
  label?: string;
  labelWidth?: string;
  adornment?: ReactNode;
  /** The stored colour ref; `""` shows "Pick color". */
  value: string;
  /** The ref as CSS (`refToCss`). Never name a JSX prop `css`: a host compiling this source with
   * Emotion's JSX runtime (pagehub.dev) strips it into a className. */
  fill: string;
  open: boolean;
  onToggle(): void;
  onClear(): void;
}

export const ColorChip = forwardRef<HTMLButtonElement, ColorChipProps>(function ColorChip(p, ref) {
  const has = p.value !== "";
  return (
    <PopoverChip
      ref={ref}
      label={p.label}
      labelWidth={p.labelWidth}
      adornment={p.adornment}
      open={p.open}
      onTriggerClick={p.onToggle}
      onClear={p.onClear}
      triggerAriaLabel={has ? "Edit color" : "Pick color"}
      clearAriaLabel="Clear color"
      variant={has ? "preview" : "default"}
      leading={
        has ? (
          <>
            {isTranslucent(p.value) && <span className="pointer-events-none absolute inset-0 z-0" style={CHECKER_BG} aria-hidden />}
            <span data-color-fill="" className="pointer-events-none absolute inset-0 z-[1]" style={{ backgroundColor: p.fill }} aria-hidden />
          </>
        ) : (
          <span className="block size-3.5 rounded-sm border" style={{ ...CHECKER_BG, borderColor: "var(--base-300)" }} aria-hidden />
        )
      }
      summary={has ? null : "Pick color"}
    />
  );
});
