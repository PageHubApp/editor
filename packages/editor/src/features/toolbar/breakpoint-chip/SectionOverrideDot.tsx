/**
 * Small primary dot beside a section title when any of its properties has a non-base
 * breakpoint override — "expand to see what is overridden inside". Rendered only when the
 * section passes `props` (property-map keys).
 *
 *   <SectionOverrideDot props={["padding", "gap"]} />
 */
import { useSectionHasAnyOverride } from "./useSectionHasAnyOverride";

export function SectionOverrideDot({ props }: { props: readonly string[] }) {
  if (!useSectionHasAnyOverride(props)) return null;
  return <span className="bg-primary inline-block size-1.5 rounded-full" aria-label="Section has breakpoint overrides" />;
}
