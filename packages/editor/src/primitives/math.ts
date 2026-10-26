/** `v` held to `[lo, hi]` (`hi` wins if the range is inverted). */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
