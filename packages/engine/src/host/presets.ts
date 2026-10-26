/**
 * Theme presets + font pairings are a HOST-supplied catalogue, so the editor takes them through facets
 * the host fills, like `blockSourceFacet` feeds the Add → Blocks panel. The Theme panel reads them with
 * `useEditorState((s) => s.facet(themePresetsFacet))`.
 */
import { defineFacet } from "../extensions/extension";

/** A palette entry inside a preset: DaisyUI token name + concrete colour. */
export interface PresetColor {
  /** `--color-<token>` suffix, e.g. `primary`, `base-100`. */
  token: string;
  color: string;
}

/** A curated theme bundle: palette + style-guide tokens + fonts, applied in one undo step. */
export interface ThemePreset {
  id: string;
  name: string;
  description?: string;
  palette: readonly PresetColor[];
  /** Optional dark palette variant. */
  darkPalette?: readonly PresetColor[];
  /** Style-guide token overrides keyed by `StyleTokenDef.key` (e.g. `radiusBox`, `shadowStyle`). */
  tokens?: Readonly<Record<string, string>>;
  /** Corner radii (rem), keyed by `RADIUS_KEYS.key` (`box` / `field` / `selector`). */
  radius?: Readonly<Record<string, number>>;
  fonts?: { heading?: string; body?: string };
}

/** A font pairing suggestion the Typography section offers. */
export interface FontPairing {
  id: string;
  name: string;
  heading: string;
  body: string;
}

export const themePresetsFacet = defineFacet<readonly ThemePreset[], readonly ThemePreset[]>({
  id: "themePresets",
  combine: (values) => values.at(-1) ?? [],
});

export const fontPairingsFacet = defineFacet<readonly FontPairing[], readonly FontPairing[]>({
  id: "fontPairings",
  combine: (values) => values.at(-1) ?? [],
});
