/**
 * The single react-tooltip instance the chrome's `data-tooltip-*` attributes render through.
 * Fixed positioning: the editor root clips overflow, and a host can mount the top bar outside it
 * (the dashboard puts it in its own header), so an absolute tooltip would be cut off at the root's edge.
 */
import { Tooltip } from "react-tooltip";
import { TOOLTIP_ID, TOOLTIP_SURFACE_CLASS } from "./tooltip";

export function TooltipSurface() {
  return <Tooltip id={TOOLTIP_ID} variant="light" positionStrategy="fixed" classNameArrow="hidden" className={TOOLTIP_SURFACE_CLASS} />;
}
