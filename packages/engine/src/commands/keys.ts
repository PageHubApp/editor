/** Key strings: `mod+shift+d`, `alt+up`, `escape`. `mod` is ⌘ on macOS and Ctrl elsewhere. */
export type Platform = "mac" | "other";

const MOD_ORDER = ["mod", "ctrl", "meta", "alt", "shift"] as const;
const ALIASES: Record<string, string> = {
  cmd: "meta", command: "meta", control: "ctrl", option: "alt", opt: "alt", esc: "escape",
  up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright", " ": "space", del: "delete", return: "enter",
  "=": "equal", plus: "equal", "-": "minus",
};

/** Canonical form of a key string; with `platform`, the native modifier collapses into `mod`. */
export function normalizeKey(key: string, platform?: Platform): string {
  const parts = key.toLowerCase().split(/\+(?!$)/).map((p) => ALIASES[p.trim()] ?? p.trim());
  const base = parts.pop()!;
  const mods = new Set(parts.map((m) => (platform === "mac" && m === "meta") || (platform === "other" && m === "ctrl") ? "mod" : m));
  for (const m of mods) if (!(MOD_ORDER as readonly string[]).includes(m)) throw new Error(`unknown modifier "${m}" in "${key}"`);
  return [...MOD_ORDER.filter((m) => mods.has(m)), base].join("+");
}

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  preventDefault?(): void;
  stopPropagation?(): void;
}

/** Canonical key of a keyboard event. */
export function eventKey(e: KeyEventLike, platform: Platform): string {
  const mods = [
    e.ctrlKey && (platform === "other" ? "mod" : "ctrl"),
    e.metaKey && (platform === "mac" ? "mod" : "meta"),
    e.altKey && "alt",
    e.shiftKey && "shift",
  ].filter(Boolean);
  return normalizeKey([...mods, e.key === "+" ? "plus" : e.key].join("+"), platform);
}
