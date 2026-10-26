/**
 * Rich-text styles installed in the canvas document: the edited element (no focus ring,
 * whitespace kept as typed), `{{ output }}` chips, and the dashed empty-text hints.
 */
export const RICHTEXT_STYLE_ID = "ph-richtext-css";

export const RICHTEXT_CSS = `
[data-rt-editing]{outline:none;white-space:pre-wrap;word-wrap:break-word;cursor:text;caret-color:currentColor}
[data-rt-editing][data-rt-blank]{outline:1px dashed currentColor;outline-offset:2px;min-width:1ch;min-height:1em}
.ph-rt-chip{display:inline-block;padding:0 .3em;margin:0 .1em;border-radius:.3em;font:inherit;font-size:.85em;line-height:1.3;background:color-mix(in srgb,currentColor 12%,transparent);outline:1px solid color-mix(in srgb,currentColor 25%,transparent);user-select:all}
.ph-rt-chip.ProseMirror-selectednode{outline:2px solid #3b82f6}
[data-rt-empty]::before{content:"Empty text";display:inline-block;padding:0 .4em;opacity:.5;outline:1px dashed currentColor;font-size:.85em}
[data-rt-empty][data-selected]::before{content:"Click to edit"}
`;
