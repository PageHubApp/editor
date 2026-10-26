/**
 * The theme the editor chrome renders in, as the `data-theme` of its scope element. An explicit theme always wins:
 *
 *   1. the `theme` prop,
 *   2. the nearest `data-theme` of the host (a wrapper element the host themes itself with),
 *   3. the OS colour scheme, only when the host gives neither.
 *
 * Re-read when the host flips its `data-theme` while the editor stays mounted, and when the OS scheme changes.
 */
import { createContext, useContext, useLayoutEffect, useState } from "react";

export type ChromeTheme = "light" | "dark";

/** The theme <Editor> resolved for its scope, for chrome portalled to a host element outside that scope. */
const ChromeThemeContext = createContext<ChromeTheme | undefined>(undefined);
export const ChromeThemeProvider = ChromeThemeContext.Provider;
export const useResolvedChromeTheme = (): ChromeTheme | undefined => useContext(ChromeThemeContext);

const asTheme = (v: string | null | undefined): ChromeTheme | undefined => (v === "dark" || v === "light" ? v : undefined);

export function useChromeTheme(scope: HTMLElement | null, explicit?: ChromeTheme): ChromeTheme | undefined {
  const [theme, setTheme] = useState<ChromeTheme | undefined>(explicit);
  useLayoutEffect(() => {
    if (explicit) return setTheme(explicit);
    if (!scope) return;
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const read = () => {
      const host = asTheme(scope.parentElement?.closest("[data-theme]")?.getAttribute("data-theme"));
      setTheme(host ?? (media?.matches ? "dark" : "light"));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], subtree: true });
    media?.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", read);
    };
  }, [scope, explicit]);
  return theme;
}
