/**
 * The control-dispatch seam: given a property's `ControlSpec`, render its REAL control.
 * Reads/writes flow through the engine's class model (`classBinding` / `readClass` /
 * `classes.set`) via the shared connectors — a spec only picks the control + its presentation.
 *
 *   const spec = controlSpecFor(row.id);
 *   if (spec) return <SpecControl spec={spec} row={row} />;
 *
 * Colour rows are popover rows: `PropertyRow` draws the chip as a colour swatch and renders this
 * control's `color` branch (the picker body) inside the popover, so the whole pin / add / clear
 * machinery is reused and the panel still is the real Sketch picker + palette.
 */
import type { NodeHandle } from "@pagehub/engine";
import type { RowDef } from "../rows/inspectorRows";
import { ControlIcon, FONT_FAMILY_OPTS, type ControlSpec } from "../controlSpecs";
import type { ToolbarOption } from "../../toolbar/ToolbarItemView";
import { ColorInput } from "../../pickers/ColorInput";
import { ToolbarItem } from "../../toolbar/ToolbarItem";
import { UniversalInput } from "../../toolbar/UniversalInput";
import { MultiToggleControl } from "./MultiToggleControl";
import { ShorthandControl } from "./ShorthandControl";
import { BundleControl } from "./BundleControl";
import { GradientControl } from "./GradientControl";
import { PatternControl } from "./PatternControl";
import { AnimationControl } from "./AnimationControl";
import { TextStyleControl } from "./TextStyleControl";
import { LayoutPresetControl } from "../LayoutPresetControl";

export function SpecControl({ spec, row, handle }: { spec: ControlSpec; row: RowDef; handle: NodeHandle }) {
  switch (spec.kind) {
    case "radio": {
      const options: ToolbarOption[] = spec.options.map((o) => ({ value: o.value, label: o.icon ? <ControlIcon name={o.icon} /> : o.text, hint: o.hint }));
      return <ToolbarItem prop={row.id} label={row.label} type="radio" options={options} />;
    }
    case "shorthand":
      return <ShorthandControl label={row.label} modes={spec.modes} allowedTypes={spec.allowedTypes} />;
    case "multi-toggle":
      return <MultiToggleControl label={row.label} toggles={spec.toggles} />;
    case "universal":
      return <UniversalInput prop={row.id} label={row.label} prefix={spec.prefix} options={spec.options} allowedTypes={spec.allowedTypes} />;
    case "font":
      return <UniversalInput prop={row.id} label={row.label} options={FONT_FAMILY_OPTS} allowedTypes={["tailwind"]} />;
    case "textStyle":
      return <TextStyleControl label={row.label} />;
    case "color":
      // Inline colour row (border, gradient stops, shadow, ring, SVG): the self-framing swatch
      // chip + floating picker. Popover colour rows are drawn by `PropertyRow`'s ColorPopoverRow.
      return <ColorInput prop={row.id} label={row.label} />;
    // ── bundle / effects families — the real stacked / bespoke controls ──
    case "bundle":
      return <BundleControl items={spec.items} />;
    case "gradient":
      return <GradientControl />;
    case "pattern":
      return <PatternControl />;
    case "animation":
      return <AnimationControl />;
    case "layout":
      return <LayoutPresetControl handle={handle} />;
  }
}
