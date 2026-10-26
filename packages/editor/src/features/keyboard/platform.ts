/** Which modifier is "mod" (⌘ on macOS, Ctrl elsewhere); hosts and tests can pin it on `<Editor platform>`. */
import { createContext, useContext } from "react";
import { normalizeKey, type Platform } from "@pagehub/engine";

export type { Platform };

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? "") ? "mac" : "other";
}

const PlatformContext = createContext<Platform | null>(null);
export const PlatformProvider = PlatformContext.Provider;

/** The pinned platform, else the detected one. */
export function usePlatform(): Platform {
  return useContext(PlatformContext) ?? detectPlatform();
}

const MAC: Record<string, string> = { mod: "⌘", meta: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃" };
const OTHER: Record<string, string> = { mod: "Ctrl", ctrl: "Ctrl", meta: "Win", shift: "Shift", alt: "Alt" };
const KEY_NAMES: Record<string, string> = {
  escape: "Esc", backspace: "⌫", delete: "Del", enter: "↵", tab: "Tab", space: "Space",
  arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", equal: "+", minus: "−",
};

/** `mod+shift+z` → `⇧⌘Z` on macOS, `Ctrl+Shift+Z` elsewhere. */
export function formatShortcut(key: string, platform: Platform): string {
  const parts = normalizeKey(key).split(/\+(?!$)/);
  const base = parts.pop()!;
  const names = platform === "mac" ? MAC : OTHER;
  // macOS orders the modifiers ⌃⌥⇧⌘; other platforms read Ctrl+Alt+Shift
  const order = platform === "mac" ? ["ctrl", "alt", "shift", "meta", "mod"] : ["mod", "ctrl", "meta", "alt", "shift"];
  const mods = order.filter((m) => parts.includes(m)).map((m) => names[m]!);
  const label = KEY_NAMES[base] ?? (base.length === 1 ? base.toUpperCase() : base[0]!.toUpperCase() + base.slice(1));
  return platform === "mac" ? [...mods, label].join("") : [...mods, label].join("+");
}
