/**
 * The site's colour tokens (`primary`, `base-100`…) the colour picker lists. The host supplies
 * the real palette (from the theme); the default is the DaisyUI token names with neutral swatches.
 */
import { defineFacet } from "../extensions/extension";

export interface ThemeColor {
  /** The token name used in classes: `bg-<name>`. */
  name: string;
  /** A CSS colour for the swatch. */
  color: string;
}

export interface ThemeColors {
  light(): readonly ThemeColor[];
  dark?(): readonly ThemeColor[];
}

const TOKENS: readonly [string, string][] = [
  ["primary", "#4f46e5"],
  ["primary-content", "#ffffff"],
  ["secondary", "#0ea5e9"],
  ["secondary-content", "#ffffff"],
  ["accent", "#f59e0b"],
  ["accent-content", "#1f2937"],
  ["neutral", "#374151"],
  ["neutral-content", "#e5e7eb"],
  ["base-100", "#ffffff"],
  ["base-200", "#f3f4f6"],
  ["base-300", "#e5e7eb"],
  ["base-content", "#1f2937"],
];

export const defaultThemeColors: ThemeColors = { light: () => TOKENS.map(([name, color]) => ({ name, color })) };

export const themeColorsFacet = defineFacet<ThemeColors, ThemeColors>({ id: "themeColors", combine: (values) => values[0] ?? defaultThemeColors });
