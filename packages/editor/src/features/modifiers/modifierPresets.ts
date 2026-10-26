/**
 * The style-modifier presets the Modifiers panel offers. A modifier is a reusable, named class
 * bundle stacked on top of an element's own classes — here each is one `ph-mod-*` token, the
 * class group the tailwind kit registers (`modifier-presets` in groups.ts, names in
 * `PH_MOD_NAMES`). Applying one adds its token to the selected element; removing it strips it.
 *
 * `MODIFIER_PRESET_CSS` is the canvas stylesheet for these tokens. It mirrors the
 * `.ph-mod-*` rules of packages/site-runtime/src/kit.css, with one change: kit.css reads the
 * legacy `--primary` / `--base-content` aliases, which the demo's compiled Tailwind/DaisyUI
 * sheet does not define — so the state looks here read the canonical `--color-*` tokens instead
 * (the same ones the Theme panel edits), so a modifier's colour follows the site palette live.
 */

type ModifierCategory = "Interaction" | "State";

export interface ModifierPreset {
  /** The class token (without prefix); the `modifier-presets` group matches it. */
  token: string;
  label: string;
  description: string;
  category: ModifierCategory;
  /** The look shows at rest (visible in a screenshot), not only on hover / active. */
  resting: boolean;
}

export const MODIFIER_PRESETS: readonly ModifierPreset[] = [
  { token: "ph-mod-grow", label: "Grow", description: "Scales up on hover, down on click.", category: "Interaction", resting: false },
  { token: "ph-mod-lift", label: "Lift", description: "Rises on hover, settles on click.", category: "Interaction", resting: false },
  { token: "ph-mod-press", label: "Press", description: "Gentle scale on hover and click.", category: "Interaction", resting: false },
  { token: "ph-mod-glow", label: "Glow", description: "Soft shadow halo on hover.", category: "Interaction", resting: false },
  { token: "ph-mod-tab-active", label: "Active tab", description: "Primary border and text for the current tab.", category: "State", resting: true },
  { token: "ph-mod-dot-active", label: "Active dot", description: "Filled primary dot, scaled up.", category: "State", resting: true },
  { token: "ph-mod-chip-selected", label: "Selected chip", description: "Outlined to mark the chosen chip.", category: "State", resting: true },
  { token: "ph-mod-chip-unavailable", label: "Unavailable", description: "Dimmed and struck through, not clickable.", category: "State", resting: true },
  { token: "ph-mod-disabled", label: "Disabled", description: "Dimmed and non-interactive.", category: "State", resting: true },
] as const;

export const MODIFIER_CATEGORIES: readonly ModifierCategory[] = ["Interaction", "State"];

/** The `.ph-mod-*` rules, mirrored into the canvas (the kit CSS the demo does not compile). */
export const MODIFIER_PRESET_CSS = `
.ph-mod-grow, .ph-mod-lift, .ph-mod-press { transition: transform 0.25s ease-out; }
.ph-mod-glow { transition: box-shadow 0.3s ease-out; }
.ph-mod-grow:hover { transform: scale(1.1); }
.ph-mod-grow:active { transform: scale(0.9); }
.ph-mod-lift:hover { transform: translateY(-6px); }
.ph-mod-lift:active { transform: translateY(0); }
.ph-mod-glow:hover { box-shadow: 0 0 20px rgba(0, 0, 0, 0.2); }
.ph-mod-press { transition-duration: 0.2s; }
.ph-mod-press:hover { transform: scale(1.02); }
.ph-mod-press:active { transform: scale(0.95); }
.ph-mod-tab-active { border-color: var(--color-primary); color: var(--color-primary); }
.ph-mod-dot-active { background-color: var(--color-primary); transform: scale(1.25); }
.ph-mod-disabled { opacity: 0.5; pointer-events: none; }
.ph-mod-chip-selected { outline: 2px solid var(--color-base-content); outline-offset: 2px; }
.ph-mod-chip-unavailable { opacity: 0.4; pointer-events: none; text-decoration: line-through; cursor: not-allowed; }
`.trim();
