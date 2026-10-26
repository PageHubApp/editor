/**
 * Cross-group conflicts, after tailwind-merge: writing the key group in a scope also removes the
 * listed groups' tokens in that same scope. One-directional on purpose — `p-4` replaces `px-2`,
 * while `px-2` next to `p-4` just overrides on its axis (both stay).
 */
const SIDES = ["t", "r", "b", "l"] as const;
const spacing = (k: "p" | "m") => ({
  [k]: [`${k}x`, `${k}y`, ...SIDES.map((s) => `${k}${s}`)],
  [`${k}x`]: [`${k}r`, `${k}l`],
  [`${k}y`]: [`${k}t`, `${k}b`],
});

export const CLASS_CONFLICTS: Readonly<Record<string, readonly string[]>> = {
  ...spacing("p"),
  ...spacing("m"),
  inset: ["inset-x", "inset-y", "top", "right", "bottom", "left"],
  "inset-x": ["left", "right"],
  "inset-y": ["top", "bottom"],
  gap: ["gap-x", "gap-y"],
  overflow: ["overflow-x", "overflow-y"],
  size: ["width", "height"],
  "scroll-m": ["scroll-mt"],
  "scroll-p": ["scroll-px", "scroll-py", "scroll-pt"],
  "text-size": ["leading"],
  flex: ["basis"],
  snap: ["snap-type", "snap-align"],
  decoration: ["decoration-style", "decoration-color", "decoration-thickness"],
};
