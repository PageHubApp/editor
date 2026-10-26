// Chrome CSS injected into the canvas document for selection, hover and gridline states.
/**
 * Chrome CSS injected into the canvas document (never into the site's own files). Selection and
 * hover use inset `box-shadow` so the ring follows `border-radius`; `<img>` can't paint an
 * inset shadow over its pixels, so it gets an outline instead. Gridlines stay on `outline`.
 */
export const CANVAS_STYLE_ID = "pagehub-canvas-chrome";

export const CANVAS_CSS = `
:root {
  --ph-editor-accent: rgb(59 130 246);
  --pagehub-outline-halo: inset 0 0 0 2px rgba(255, 255, 255, 0.45), inset 0 0 0 2px rgba(0, 0, 0, 0.15);
}
[data-selected="true"], [data-hover="true"] { cursor: grab; }
[data-selected="true"] iframe, [data-selected="true"] a { pointer-events: none; }
[data-show-gridlines="true"] [data-edit-src]:not([data-selected="true"]) {
  outline: 1px dashed currentColor !important;
  outline-offset: -1px;
  box-shadow: var(--pagehub-outline-halo);
}
[data-selected="true"] {
  outline: none !important;
  box-shadow: inset 0 0 0 1px var(--ph-editor-accent), var(--pagehub-outline-halo);
}
[data-parent-of-selected="true"] {
  outline: none !important;
  box-shadow: var(--pagehub-outline-halo);
}
[data-hover="true"] {
  outline: none !important;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ph-editor-accent) 60%, transparent);
}
img[data-selected="true"] {
  outline: 1px solid var(--ph-editor-accent) !important;
  outline-offset: -1px;
  box-shadow: var(--pagehub-outline-halo);
}
[data-device="true"] { scrollbar-width: none; }
[data-device="true"]::-webkit-scrollbar { display: none; }
/* Edit mode only (never the published page): the page's own native scrollbar, slim and low-contrast. */
html[data-ph-live="true"]:not([data-device="true"]) { scrollbar-width: thin; scrollbar-color: rgba(120, 120, 130, 0.45) transparent; }
html[data-ph-live="true"]:not([data-device="true"])::-webkit-scrollbar { width: 8px; height: 8px; background: transparent; }
html[data-ph-live="true"]:not([data-device="true"])::-webkit-scrollbar-track { background: transparent; }
html[data-ph-live="true"]:not([data-device="true"])::-webkit-scrollbar-thumb { background-color: rgba(120, 120, 130, 0.45); border-radius: 8px; }
html[data-ph-live="true"]:not([data-device="true"])::-webkit-scrollbar-thumb:hover { background-color: rgba(120, 120, 130, 0.7); }
[data-show-hidden="true"] .hidden { display: flex !important; border: 1px dotted currentColor; }
body[data-ph-edge="right"], body[data-ph-edge="right"] * { cursor: ew-resize !important; }
body[data-ph-edge="bottom"], body[data-ph-edge="bottom"] * { cursor: ns-resize !important; }
body[data-ph-rotate="true"], body[data-ph-rotate="true"] * { cursor: var(--ph-rotate-cursor, grab) !important; }
body[data-is-dragging], body[data-is-dragging] * { cursor: grabbing !important; }
/* Shift+copy drag: keep the source fully visible (it is being duplicated, not lifted). */
body[data-is-dragging][data-ph-drag-copy] [data-dragging] { opacity: 1 !important; }
/* Move drag: the source becomes a flat blue ghost tile — same footprint, no border, no chrome,
   no text, no background image, no children visible — so it reads as "lifted" (not duplicated)
   and dropping it back never shifts the layout. Mirrors canvas-interaction.css. */
body[data-is-dragging]:not([data-ph-drag-copy]) [data-dragging] {
  opacity: 1 !important;
  background: rgb(59 130 246 / 0.18) !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  color: transparent !important;
  border-radius: 4px !important;
}
body[data-is-dragging]:not([data-ph-drag-copy]) [data-dragging] > * { visibility: hidden !important; }
[data-ph-role="client"] [data-editable] { cursor: pointer; }
[data-ph-role="client"] [data-editable]:hover:not([data-selected="true"]) {
  outline: 1px dashed var(--ph-editor-accent) !important;
  outline-offset: 2px;
}
body[data-dragging-type="section"] :is(main, header, footer) { outline: 2px dashed currentColor !important; outline-offset: -2px; }
`;
