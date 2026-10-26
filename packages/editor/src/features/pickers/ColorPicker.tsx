/**
 * The default `ColorPicker` slot: the "Color" floating panel — 280×540, min 260×420, max width
 * 400, size not persisted — placed 8px beside its anchor (right of it when the anchor sits in the
 * left half of the window, else left of it).
 *
 *   <Slot name="ColorPicker" value="palette:primary" onChange={set} anchor={chipEl} onClose={close} />
 */
import { useMemo } from "react";
import type { ValuePickerProps } from "../../components";
import { usePaletteTokens } from "../theme/usePaletteTokens";
import { FloatingPanel } from "../../primitives/FloatingPanel";
import { ColorPanelBody } from "./ColorPanelBody";

const COLOR_PANEL = { width: 280, height: 540, gap: 8 } as const;

/** Where a side panel opens next to its trigger (shared by the colour, icon and font panels). */
export function panelPosition(rect: Pick<DOMRect, "left" | "right" | "top">, width: number, viewportWidth: number): { x: number; y: number } {
  const onLeft = (rect.left + rect.right) / 2 < viewportWidth / 2;
  const x = onLeft ? rect.right + COLOR_PANEL.gap : rect.left - width - COLOR_PANEL.gap;
  return { x: Math.max(COLOR_PANEL.gap, Math.min(x, viewportWidth - width - COLOR_PANEL.gap)), y: Math.max(8, rect.top) };
}


export function ColorPicker({ value, onChange, onClose, anchor }: ValuePickerProps) {
  // The palette the picker shows AND edits is the live `theme.css` one (so created tokens appear and
  // recolours reflect), with create / rename / delete going through the Theme panel's `theme.css` seam.
  const palette = usePaletteTokens();
  const initialPosition = useMemo(() => (anchor ? panelPosition(anchor.getBoundingClientRect(), COLOR_PANEL.width, window.innerWidth) : undefined), [anchor]);
  const close = () => onClose?.();
  return (
    <FloatingPanel isOpen onClose={close} title="Color" storageKey="color-input" autoSize={false} defaultWidth={COLOR_PANEL.width} defaultHeight={COLOR_PANEL.height} minWidth={260} maxWidth={400} minHeight={420} initialPosition={initialPosition} persistSize={false} scrollable ignoreOutsideClicks={anchor ? [{ current: anchor }] : undefined}>
      <div data-slot="ColorPicker" className="contents">
        <ColorPanelBody value={value} onChange={onChange} onClear={() => onChange("")} onPickAndClose={close} theme={palette.theme} crud={palette} />
      </div>
    </FloatingPanel>
  );
}
