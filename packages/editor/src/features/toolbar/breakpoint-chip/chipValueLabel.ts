/**
 * Plain-words label for a class token shown in the breakpoint chip: `p-4` → "16px",
 * `p-[24px]` → "24px", `gap-space-md` → "Medium", `text-xl` → "Extra Large". The label comes from
 * `humanizeTailwindValue`; only the numeric spacing scale (4px steps) is converted to px here.
 * The raw token stays available as the cell's tooltip.
 */
import { humanizeTailwindValue } from "../universal/displayLabel";

const SPACING_STEM = /^-?(p[xytrblse]?|m[xytrblse]?|gap(-[xy])?|space-[xy]|inset(-[xy])?|top|right|bottom|left|w|h|size|min-[wh]|max-[wh])$/;

export function chipValueLabel(token: string): string {
  const arb = /^-?[a-z]+(?:-[a-z]+)*-\[(.+)\]$/.exec(token);
  if (arb) return arb[1]!.replace(/_/g, " ");
  if (token.includes("[") || token.includes("(")) return token;
  const dash = token.lastIndexOf("-");
  if (dash <= 0) return humanizeTailwindValue("", token);
  const prefix = token.slice(0, dash);
  const body = token.slice(dash + 1);
  if (SPACING_STEM.test(prefix) && /^\d+(\.\d+)?$/.test(body)) return `${parseFloat(body) * 4}px`;
  return humanizeTailwindValue(prefix, token);
}
