/** The single react-tooltip instance the chrome's `data-tooltip-*` attributes render through. */
import { Tooltip } from "react-tooltip";
import { TOOLTIP_ID, TOOLTIP_SURFACE_CLASS } from "./tooltip";

export function TooltipSurface() {
  return <Tooltip id={TOOLTIP_ID} variant="light" classNameArrow="hidden" className={TOOLTIP_SURFACE_CLASS} />;
}
