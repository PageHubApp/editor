import { THEME_KEY } from "../head/theme";

/** Click on `[data-theme-toggle]`: flip `data-theme` between dark and light on `<html>` and remember it. */
export function themeClick(e: Event) {
  if (!(e.target as Element | null)?.closest?.("[data-theme-toggle]")) return;
  const doc = (e.target as Element).ownerDocument;
  const root = doc.documentElement;
  const win = doc.defaultView;
  const cur = root.getAttribute("data-theme") || (win?.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    win?.localStorage.setItem(THEME_KEY, next);
  } catch {
    /* applies for this page only */
  }
}
