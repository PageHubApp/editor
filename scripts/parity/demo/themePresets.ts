/**
 * Demo theme presets + font pairings for the parity demo. The real app serves these from
 * `list_presets` / `suggest_font_pairings`; here a small curated set is seeded into the editor
 * via `themePresetsFacet` / `fontPairingsFacet` (main.tsx), mirroring how DEMO_BLOCKS feeds the
 * Add panel. Palette tokens use the DaisyUI names the Theme panel edits (`primary`, `base-100`,
 * `primary-content`, …).
 */
import type { FontPairing, ThemePreset } from "../../../packages/engine/src/host.ts";

export const DEMO_THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "warm-editorial",
    name: "Warm Editorial",
    description: "Cream backgrounds, deep forest green, serif headings — magazine / cafe feel.",
    palette: [
      { token: "primary", color: "#2f513a" },
      { token: "primary-content", color: "#ffffff" },
      { token: "secondary", color: "#6b7f58" },
      { token: "secondary-content", color: "#ffffff" },
      { token: "accent", color: "#c9a227" },
      { token: "accent-content", color: "#1a1a14" },
      { token: "neutral", color: "#e8e3d5" },
      { token: "neutral-content", color: "#5c5848" },
      { token: "base-100", color: "#f5f1e6" },
      { token: "base-200", color: "#ebe5d4" },
      { token: "base-300", color: "#ddd4bd" },
      { token: "base-content", color: "#21201b" },
    ],
    radius: { box: 0.25, field: 0.25, selector: 0.25 },
    tokens: { shadowStyle: "0 1px 3px rgb(0 0 0 / 0.08)", depth: "1", noise: "0" },
    fonts: { heading: "Playfair Display", body: "Inter" },
  },
  {
    id: "midnight-indigo",
    name: "Midnight Indigo",
    description: "Dark slate with electric indigo and cyan accents — modern SaaS.",
    palette: [
      { token: "primary", color: "#818cf8" },
      { token: "primary-content", color: "#0f0f1a" },
      { token: "secondary", color: "#1e1b4b" },
      { token: "secondary-content", color: "#e0e7ff" },
      { token: "accent", color: "#22d3ee" },
      { token: "accent-content", color: "#0f172a" },
      { token: "neutral", color: "#1e293b" },
      { token: "neutral-content", color: "#94a3b8" },
      { token: "base-100", color: "#0f172a" },
      { token: "base-200", color: "#1e293b" },
      { token: "base-300", color: "#334155" },
      { token: "base-content", color: "#f1f5f9" },
    ],
    radius: { box: 0.75, field: 0.5, selector: 0.5 },
    tokens: { shadowStyle: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", depth: "1" },
    fonts: { heading: "Space Grotesk", body: "Inter" },
  },
  {
    id: "coral-pop",
    name: "Coral Pop",
    description: "Bright coral and teal on white — playful consumer brand.",
    palette: [
      { token: "primary", color: "#ff5a5f" },
      { token: "primary-content", color: "#ffffff" },
      { token: "secondary", color: "#008489" },
      { token: "secondary-content", color: "#ffffff" },
      { token: "accent", color: "#ffb400" },
      { token: "accent-content", color: "#3a2a00" },
      { token: "neutral", color: "#f2f2f2" },
      { token: "neutral-content", color: "#595959" },
      { token: "base-100", color: "#ffffff" },
      { token: "base-200", color: "#fafafa" },
      { token: "base-300", color: "#ededed" },
      { token: "base-content", color: "#1a1a1a" },
    ],
    radius: { box: 1, field: 0.75, selector: 1 },
    tokens: { shadowStyle: "0 25px 50px -12px rgb(0 0 0 / 0.25)", depth: "1" },
    fonts: { heading: "Poppins", body: "Nunito" },
  },
  {
    id: "mono-minimal",
    name: "Mono Minimal",
    description: "Black, white and grey, no shadows — stark editorial minimalism.",
    palette: [
      { token: "primary", color: "#0a0a0a" },
      { token: "primary-content", color: "#fafafa" },
      { token: "secondary", color: "#404040" },
      { token: "secondary-content", color: "#ffffff" },
      { token: "accent", color: "#0a0a0a" },
      { token: "accent-content", color: "#ffffff" },
      { token: "neutral", color: "#f5f5f5" },
      { token: "neutral-content", color: "#525252" },
      { token: "base-100", color: "#ffffff" },
      { token: "base-200", color: "#f5f5f5" },
      { token: "base-300", color: "#e5e5e5" },
      { token: "base-content", color: "#0a0a0a" },
    ],
    radius: { box: 0, field: 0, selector: 0 },
    tokens: { shadowStyle: "none", depth: "0", noise: "0", border: "1px" },
    fonts: { heading: "Archivo", body: "Inter" },
  },
];

export const DEMO_FONT_PAIRINGS: readonly FontPairing[] = [
  { id: "playfair-inter", name: "Editorial", heading: "Playfair Display", body: "Inter" },
  { id: "space-inter", name: "Technical", heading: "Space Grotesk", body: "Inter" },
  { id: "poppins-nunito", name: "Friendly", heading: "Poppins", body: "Nunito" },
  { id: "archivo-inter", name: "Minimal", heading: "Archivo", body: "Inter" },
];
