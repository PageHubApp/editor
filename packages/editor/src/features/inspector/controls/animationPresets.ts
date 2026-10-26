/**
 * Entrance-animation preset catalogue, matched to the keyframes the site runtime ships in
 * `packages/site-runtime/src/animate.css`.
 *
 * The standalone's `animation` property is the entrance preset on a node's `data-animate`
 * attribute: the runtime (`chunks/animate.ts`) reveals the element on scroll (or on load with
 * `data-animate-trigger="load"`) by adding `animate-css-<preset>`. Each entry's `key` is exactly
 * that kebab-case preset value. Continuous / hover animations in the standalone are a separate
 * mechanism (`twAnimate` / `animationLoop` → Tailwind `animate-*` classes), not this row.
 *
 * `ANIMATION_PREVIEW_CSS` mirrors the entrance rules + keyframes so the inspector's preview tile
 * can play the selected preset inside the editor chrome document (which doesn't load the site's
 * own `animate.css`). The canonical published-page copy stays in `site-runtime/animate.css`.
 */

interface AnimationPreset {
  /** `data-animate` attribute value (kebab-case). */
  key: string;
  /** Display label in the picker. */
  label: string;
  /** optgroup category. */
  group: "Entrance";
}

const ANIMATION_PRESETS: readonly AnimationPreset[] = [
  { key: "fade-in", label: "Fade In", group: "Entrance" },
  { key: "fade-up", label: "Fade Up", group: "Entrance" },
  { key: "fade-down", label: "Fade Down", group: "Entrance" },
  { key: "fade-left", label: "Fade Left", group: "Entrance" },
  { key: "fade-right", label: "Fade Right", group: "Entrance" },
  { key: "scale-up", label: "Scale Up", group: "Entrance" },
  { key: "blur-in", label: "Blur In", group: "Entrance" },
  { key: "slide-up", label: "Slide Up", group: "Entrance" },
  { key: "flip-in", label: "Flip In", group: "Entrance" },
  { key: "spring", label: "Spring", group: "Entrance" },
  { key: "bounce-in", label: "Bounce In", group: "Entrance" },
  { key: "thud-in", label: "Thud In", group: "Entrance" },
  { key: "tile-flip", label: "Tile Flip", group: "Entrance" },
];

/** Picker options grouped by `group`, in catalogue order. */
export const ANIMATION_GROUPS: readonly { group: string; presets: readonly AnimationPreset[] }[] = (() => {
  const order: string[] = [];
  const by = new Map<string, AnimationPreset[]>();
  for (const p of ANIMATION_PRESETS) {
    if (!by.has(p.group)) {
      by.set(p.group, []);
      order.push(p.group);
    }
    by.get(p.group)!.push(p);
  }
  return order.map((group) => ({ group, presets: by.get(group)! }));
})();

/** Display label for a stored `data-animate` value (falls back to the raw value). */
export const animationLabel = (key: string): string => ANIMATION_PRESETS.find((p) => p.key === key)?.label ?? key;

/** When the entrance plays. The runtime treats anything but `load` as reveal-on-scroll. */
export const ANIMATION_TRIGGERS: readonly { value: string; label: string }[] = [
  { value: "", label: "On scroll" },
  { value: "load", label: "On load" },
];

/**
 * Entrance-animation param overrides (duration / delay / easing / repeat). Each option's `value`
 * is the FULL class token written through `classes.set` (one per
 * engine group in `groups.ts`), `""` clears the group. Arbitrary `[--anim-*]` custom-property
 * utilities are used — the `animate-css-<preset>` rules in `site-runtime/animate.css` read these vars
 * inside their single `animation:` shorthand, so the override wins regardless of published source
 * order. A plain `[animation-duration:…]` longhand (or Tailwind `duration-*`, which sets `transition`)
 * would instead lose to that shorthand whenever Tailwind layers it in `@layer utilities`.
 */
interface AnimationParamOption {
  /** Full class token (`[--anim-duration:0.5s]`), or `""` to clear the group. */
  value: string;
  label: string;
  /** Fuller accessible name when the display label is abbreviated to fit the pill. */
  aria?: string;
}
export interface AnimationParamRow {
  /** Engine class-group id (`groups.ts`). */
  group: string;
  label: string;
  options: readonly AnimationParamOption[];
}

export const ANIMATION_PARAM_ROWS: readonly AnimationParamRow[] = [
  {
    group: "anim-duration",
    label: "Duration",
    options: [
      { value: "", label: "Auto" },
      { value: "[--anim-duration:0.3s]", label: "0.3s" },
      { value: "[--anim-duration:0.5s]", label: "0.5s" },
      { value: "[--anim-duration:0.8s]", label: "0.8s" },
      { value: "[--anim-duration:1.2s]", label: "1.2s" },
    ],
  },
  {
    group: "anim-delay",
    label: "Delay",
    options: [
      { value: "", label: "Off", aria: "No delay" },
      { value: "[--anim-delay:0.1s]", label: "0.1s" },
      { value: "[--anim-delay:0.3s]", label: "0.3s" },
      { value: "[--anim-delay:0.5s]", label: "0.5s" },
      { value: "[--anim-delay:1s]", label: "1s" },
    ],
  },
  {
    group: "anim-easing",
    label: "Easing",
    options: [
      { value: "", label: "Auto" },
      { value: "[--anim-easing:ease-out]", label: "Out", aria: "Ease out" },
      { value: "[--anim-easing:ease-in]", label: "In", aria: "Ease in" },
      { value: "[--anim-easing:ease-in-out]", label: "Both", aria: "Ease in-out" },
      { value: "[--anim-easing:linear]", label: "Lin", aria: "Linear" },
    ],
  },
  {
    group: "anim-iteration",
    label: "Repeat",
    options: [
      { value: "", label: "Once" },
      { value: "[--anim-iteration:2]", label: "2×" },
      { value: "[--anim-iteration:3]", label: "3×" },
      { value: "[--anim-iteration:infinite]", label: "Loop" },
    ],
  },
];

export const ANIMATION_PREVIEW_STYLE_ID = "ph-animation-preview-css";

/**
 * Entrance rules + keyframes, mirrored from `site-runtime/animate.css`. Injected once into the
 * editor document so the inspector preview tile plays; `.ph-anim-preview` scopes it so it never
 * touches canvas content.
 */
export const ANIMATION_PREVIEW_CSS = `
.ph-anim-preview .animate-css-fade-in { animation: css-fade-in var(--anim-duration, 0.6s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-fade-up { animation: css-fade-up var(--anim-duration, 0.6s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-fade-down { animation: css-fade-down var(--anim-duration, 0.6s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-fade-left { animation: css-fade-left var(--anim-duration, 0.6s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-fade-right { animation: css-fade-right var(--anim-duration, 0.6s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-scale-up { animation: css-scale-up var(--anim-duration, 0.5s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-blur-in { animation: css-blur-in var(--anim-duration, 0.7s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-slide-up { animation: css-slide-up var(--anim-duration, 0.5s) var(--anim-easing, cubic-bezier(0.25, 0.46, 0.45, 0.94)) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-flip-in { animation: css-flip-in var(--anim-duration, 0.6s) var(--anim-easing, ease-out) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-spring { animation: css-spring var(--anim-duration, 0.5s) var(--anim-easing, cubic-bezier(0.175, 0.885, 0.32, 1.275)) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-bounce-in { animation: css-bounce-in var(--anim-duration, 0.6s) var(--anim-easing, cubic-bezier(0.175, 0.885, 0.32, 1.275)) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-thud-in { animation: css-thud-in var(--anim-duration, 0.55s) var(--anim-easing, cubic-bezier(0.22, 1, 0.36, 1)) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
.ph-anim-preview .animate-css-tile-flip { animation: css-tile-flip var(--anim-duration, 0.48s) var(--anim-easing, cubic-bezier(0.22, 1, 0.36, 1)) var(--anim-delay, 0s) var(--anim-iteration, 1) both; }
@keyframes css-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes css-fade-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
@keyframes css-fade-down { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(0); } }
@keyframes css-fade-left { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
@keyframes css-fade-right { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
@keyframes css-scale-up { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
@keyframes css-blur-in { from { opacity: 0; filter: blur(12px); } to { opacity: 1; filter: blur(0); } }
@keyframes css-slide-up { from { transform: translateY(60px); } to { transform: translateY(0); } }
@keyframes css-flip-in { from { opacity: 0; transform: perspective(400px) rotateY(90deg); } to { opacity: 1; transform: perspective(400px) rotateY(0); } }
@keyframes css-spring { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
@keyframes css-bounce-in { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
@keyframes css-thud-in { 0% { opacity: 0; transform: scale(0.95); } 58% { opacity: 1; transform: scale(1.04); } 78% { transform: scale(0.97); } 100% { opacity: 1; transform: scale(1); } }
@keyframes css-tile-flip {
  0% { opacity: 0; transform: perspective(160px) rotateX(-52deg) scale(0.92); background-color: var(--tile-flip-from, #f3f4f6); color: var(--tile-flip-color-from, #111827); }
  36% { opacity: 1; transform: perspective(160px) rotateX(0) scale(1); }
  54% { transform: perspective(160px) rotateX(78deg) scale(1); }
  55% { background-color: var(--tile-flip-to, #787c7e); color: var(--tile-flip-color-to, #fff); transform: perspective(160px) rotateX(78deg) scale(1); }
  100% { transform: perspective(160px) rotateX(0) scale(1); background-color: var(--tile-flip-to, #787c7e); color: var(--tile-flip-color-to, #fff); }
}
@media (prefers-reduced-motion: reduce) { .ph-anim-preview [class*="animate-css-"] { animation: none !important; } }
`;

/** Exit presets (`data-animate-exit`): played when the element scrolls back out; keyframes in `site-runtime/animate.css`. */
export const ANIMATION_EXITS: readonly { value: string; label: string; aria: string }[] = [
  { value: "", label: "None", aria: "No exit animation" },
  { value: "fade-out", label: "Fade out", aria: "Fade out" },
  { value: "fade-out-up", label: "Fade out up", aria: "Fade out upward" },
  { value: "fade-out-down", label: "Fade out down", aria: "Fade out downward" },
  { value: "scale-down", label: "Shrink", aria: "Scale down" },
];

/** Stagger steps (`data-animate-stagger` on the PARENT): each animated child starts one step after the previous. */
export const ANIMATION_STAGGERS: readonly { value: string; label: string }[] = [
  { value: "", label: "Off" },
  { value: "50ms", label: "50" },
  { value: "100ms", label: "100" },
  { value: "200ms", label: "200" },
  { value: "300ms", label: "300" },
];
