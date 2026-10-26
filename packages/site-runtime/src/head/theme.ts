export const THEME_KEY = "ph-theme";
/** Inline head script: applies the stored theme, else the OS preference, to `<html data-theme>` before first paint. */
export const THEME_SNIPPET =
  '(function(){try{var t=localStorage.getItem("ph-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})()';
