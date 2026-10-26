/** The `--pattern-*` custom properties a pattern reads, as classes: `[--pattern-<name>:<value>]`. */
export const PATTERN_NUMBER_VARS = ["angle", "spacing-x", "spacing-y", "stroke", "zoom", "x", "y"] as const;
/** Colour layers 1..4 (the library's widest pattern has 5 layers, one of them the background). */
export const PATTERN_COLOR_VARS = ["color-1", "color-2", "color-3", "color-4"] as const;
export const PATTERN_VARS = [...PATTERN_NUMBER_VARS, ...PATTERN_COLOR_VARS] as const;
export const PATTERN_CLASS_PREFIX = "ph-pattern-";
