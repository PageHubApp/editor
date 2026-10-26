import type { CartAdapter } from "./chunks/cart";
import type { TrackAdapter } from "./chunks/track";

export interface RuntimeConfig {
  nonce?: string;
  /**
   * Default cart. `key` is the localStorage key the lines live under (default `cart`). With `api`, checkout POSTs
   * `{ ...body, items, successUrl, cancelUrl, promotionCode }` as JSON to that URL and follows the `url` it returns; `body`
   * is the host's own fields (a site id, a tenant). With no `api` there is no hosted checkout: the buyer goes to the page
   * at `endpoint` (default `/checkout`) with `?items=priceId:qty,…`. There is no default `api`: the host names it.
   * `adapter` replaces the localStorage cart entirely (programmatic only).
   */
  cart?: { key?: string; api?: string; body?: Record<string, unknown>; endpoint?: string; adapter?: CartAdapter };
  /**
   * `data-chat-send` dispatches `event` on `document` (default `site:chat`, `detail: { text, open: true }`) for the chat widget.
   * `api` is the site-chat endpoint base (`/api/site-chat/<siteId>`, with `/history` and `/message` under it) that `[data-chat]`
   * widgets talk to; with none, a `[data-chat]` root stays hidden and only the event fires. There is no default `api`: the host names it.
   */
  chat?: { event?: string; api?: string };
  /** `adapters` maps a provider name to a handler (programmatic only; JSON can't carry functions). */
  track?: { adapters?: Record<string, TrackAdapter> } & Record<string, unknown>;
  /**
   * `{% map %}`: where Leaflet comes from (default: unpkg, 1.9.4), loaded on first use. `lib` is a ready Leaflet
   * (programmatic only), for hosts that bundle it. `tiles` / `attribution` are the defaults for maps that set none.
   */
  map?: { leaflet?: { js?: string; css?: string; lib?: unknown }; tiles?: string; attribution?: string };
  /** Directory URL the lazy chunks are served from, ending in `/`. Defaults to `chunks/` next to the runtime script. */
  chunkBase: string;
}

/** Reads `<script type="application/json" id="runtime-config">`; bad or missing JSON gives defaults. */
export function readConfig(doc: Document = document): RuntimeConfig {
  let json: Partial<RuntimeConfig> = {};
  try {
    json = JSON.parse(doc.getElementById("runtime-config")?.textContent || "{}");
  } catch {
    /* defaults */
  }
  const chunkBase = typeof json.chunkBase === "string" && json.chunkBase ? json.chunkBase : new URL("chunks/", import.meta.url).href;
  return { ...json, chunkBase: chunkBase.endsWith("/") ? chunkBase : chunkBase + "/" };
}
