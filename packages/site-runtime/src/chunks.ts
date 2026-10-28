import type { RuntimeConfig } from "./config";

export type ChunkName = "cart" | "cart-items" | "autoplay" | "animate" | "track" | "scrollspy" | "invokers" | "form" | "map" | "fit-text" | "scroll-effect" | "overflow" | "carousel" | "state" | "state-view" | "state-compute" | "chat" | "on" | "show" | "refetch" | "actions" | "lightbox" | "date-range";

/** What a lazy chunk exports. `init` runs once after load; `mount` runs for every matching element, including ones added later. */
export interface ChunkModule {
  init?(doc: Document, cfg: RuntimeConfig): void | (() => void) | Promise<void>;
  mount?(el: Element, cfg: RuntimeConfig): void;
}

/** Selector that makes a chunk necessary. `invokers` is only needed on browsers without the native feature. */
export const CHUNK_SELECTORS: Record<ChunkName, string> = {
  cart: "[data-cart],[data-cart-count]",
  "cart-items": "[data-cart-items]",
  autoplay: "[data-autoplay]",
  animate: "[data-animate]",
  track: "[data-track]",
  scrollspy: "[data-scrollspy]",
  invokers: "button[commandfor]",
  form: "[data-form-state]",
  map: "[data-map]",
  "fit-text": "[data-fit-text]",
  "scroll-effect": "[data-scroll-effect]",
  overflow: "[data-drag-scroll],[data-wheel-horizontal],[data-scrollbar-autohide],[data-scroll-smoothing]:not([data-scroll-effect])",
  carousel: "[data-carousel]",
  state: "[data-state-set],[data-state-toggle],[data-state-clear],[data-state-step],[data-state-show],[data-state-class],[data-state-text],[data-state-src],[data-state-bind]",
  "state-view": "[data-state-in-view]",
  "state-compute": "[data-state-compute]",
  chat: "[data-chat-send],[data-chat]",
  on: "[data-on]",
  show: "[data-show-on],[data-tab-target],[popover=\"manual\"]",
  refetch: "[data-refetch]",
  actions: "[data-close-link],[data-print],[data-scroll-by],[data-set-field],[data-key-click],[data-tab-target]",
  lightbox: "[data-lightbox]",
  "date-range": "[data-date-range]",
};

export type ChunkLoader = (url: string) => Promise<ChunkModule>;
// Chunk URLs are only known at runtime: tell every bundler (Vite, webpack, Turbopack) to leave this import alone.
const defaultLoader: ChunkLoader = (url) => import(/* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ url);
let loader = defaultLoader;
/** Test seam: replace how a chunk URL becomes a module. */
export function setChunkLoader(fn: ChunkLoader | null): void {
  loader = fn ?? defaultLoader;
  cache.clear();
}

const cache = new Map<string, Promise<ChunkModule>>();
/** Loads a chunk once per `chunkBase`; repeat calls share the promise. */
export function loadChunk(name: ChunkName, base: string): Promise<ChunkModule> {
  const url = base + name + ".js";
  let p = cache.get(url);
  if (!p) cache.set(url, (p = loader(url)));
  return p;
}
