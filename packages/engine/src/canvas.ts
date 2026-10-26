/** `@pagehub/engine/canvas`: source-mapped canvas rendering and the site font head tags. */
export { EDIT_SRC_ATTR, editSrcOf, parseEditSrc, instrumentFile, instrumentFiles, renderCanvas, stripEditSrc, handleForSrc, includeTarget, includeTagFor, type SourceHost } from "./canvas/sourceMap";
export { splitThemeFonts, fontHeadTags, parseFontFaces, fallbackFaceCss, fallbackFamily, type ThemeFonts, type LocalFonts, type ParsedFontFace, type FallbackFace } from "./canvas/fontLinks";
