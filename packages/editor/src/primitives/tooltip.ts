/**
 * The tooltip surface every chrome element points at with `data-tooltip-id={TOOLTIP_ID}` +
 * `data-tooltip-content` (+ optional `-place`, `-offset`, `-delay-show`). Never the native
 * `title` attribute. `<TooltipSurface />` (TooltipSurface.tsx) mounts the one instance; `<Editor>`
 * renders it.
 */
export const TOOLTIP_ID = "pagehub-editor-tooltip";

export const TOOLTIP_SURFACE_CLASS =
  "z-100000 max-w-[220px] rounded-lg! border! border-base-300! bg-base-100! px-2! py-1! text-xs! font-normal! text-base-content! shadow-lg!";

/** Spread onto an element: `<button {...tooltip("Drag to move", "bottom")}>`. */
export function tooltip(content: string | undefined, place?: "top" | "bottom" | "left" | "right"): Record<string, string | undefined> {
  if (!content) return {};
  return { "data-tooltip-id": TOOLTIP_ID, "data-tooltip-content": content, ...(place ? { "data-tooltip-place": place } : {}) };
}
