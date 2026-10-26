/**
 * Browser runtime for published sites. A page that uses none of the runtime attributes ships no JS (`needsRuntime(html)`).
 * This entry is the API; the script a page loads is built from `runtime.ts`.
 */
export { start } from "./core";
export { readConfig, type RuntimeConfig } from "./config";
export { loadChunk, setChunkLoader, type ChunkModule, type ChunkName } from "./chunks";
export { DISMISS_SNIPPET } from "./head/dismiss";
export { THEME_SNIPPET } from "./head/theme";
export type { CartAdapter, Cart } from "./chunks/cart";
export type { TrackAdapter } from "./chunks/track";
export { CORE_SELECTORS, RUNTIME_SELECTOR, needsRuntime } from "./selector";
export { LEAFLET } from "./leaflet";
