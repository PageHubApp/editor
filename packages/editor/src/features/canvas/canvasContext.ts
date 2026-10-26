/**
 * What the canvas pieces share: the frame element, its document after the last render, the
 * render counter (overlays re-measure when it changes), the overlay layer, and how pages are
 * rendered. A host can replace the renderer with `<Editor canvasRender={…}>` (live data, a
 * worker); the default renders with the core's own tags and filters over `editor.data`, with the
 * site's stylesheet, fonts and providers coming from the host's `canvasHost` (canvasHost.ts).
 */
import { createContext, useContext } from "react";
import type { EditorState, Path, Store } from "@pagehub/engine";
import { createRendererFromConfiguration, type HostProviders } from "@pagehub/engine/render";
import { PLACEHOLDER_IMAGE } from "@pagehub/engine/host";
import { renderCanvas, splitThemeFonts, fontHeadTags, type LocalFonts } from "@pagehub/engine/canvas";
import type { CanvasHost } from "./canvasHost";
import { sampleRequest } from "./sampleParams";

/** Render `path` of `state` to canvas HTML (instrumented with `data-edit-src`). */
export type CanvasRender = (state: EditorState, path: Path) => Promise<string>;

export interface CanvasFrameInfo {
  frame: HTMLIFrameElement | null;
  doc: Document | null;
  /** Increments after every render written into the frame. */
  version: number;
  /** The overlay layer handles and chips are positioned in. */
  host: HTMLElement | null;
}

export const CanvasFrameContext = createContext<CanvasFrameInfo>({ frame: null, doc: null, version: 0, host: null });
export const useCanvasFrame = (): CanvasFrameInfo => useContext(CanvasFrameContext);

export const CanvasRenderContext = createContext<CanvasRender | null>(null);

const isUrl = (s: string) => /^(https?:|data:|blob:|\/)/.test(s);

/**
 * Providers for the `image_url` / `file_url` / `icon` filters when the host supplies none. They're gated behind
 * their provider, and `strictFilters` makes an unregistered filter a parse error, so a real site needs them
 * registered: URLs pass through, a media id has nowhere to point (an `<img>` then gets the placeholder below).
 */
const NEUTRAL_HOST: HostProviders = {
  imageUrl: (id) => (isUrl(id) ? id : ""),
  fileUrl: (name) => (isUrl(name) ? name : "#"),
  icon: () => "",
};

type Renderer = Awaited<ReturnType<typeof createRendererFromConfiguration>>;

/** What one editor keeps between renders: the renderer per configuration, the last good site CSS, the localized fonts per URL set. */
interface CanvasAssets {
  host: CanvasHost | null;
  renderers: WeakMap<object, Promise<Renderer>>;
  css: string;
  fonts: Map<string, Promise<LocalFonts | null>>;
}

const assets = new WeakMap<Store, CanvasAssets>();

/** The per-editor cache (a different host, e.g. after a site switch, starts a fresh one). */
function assetsOf(store: Store, host: CanvasHost | null): CanvasAssets {
  let a = assets.get(store);
  if (!a || a.host !== host) assets.set(store, (a = { host, renderers: new WeakMap(), css: "", fonts: new Map() }));
  return a;
}

/**
 * The host's compiled site stylesheet, kept per editor and refreshed in the background. With no copy yet, a
 * failure THROWS (the canvas shows "Render failed" with Retry): painting the page unstyled would look like a
 * bug in the site. With a copy, a failed refresh keeps the last good CSS.
 */
async function refreshSiteCss(a: CanvasAssets, state: EditorState): Promise<string> {
  try {
    a.css = (await a.host!.siteCss!(state)) ?? a.css;
  } catch (e) {
    if (!a.css) throw e;
  }
  return a.css;
}

/**
 * The host's self-hosted copies of the theme's fonts, per font-URL set. `null` (no host, offline, failed)
 * makes the canvas fall back to the remote font `<link>`s, and a failed lookup is not cached: the next
 * render (or a Retry) asks again.
 */
function localFontsFor(a: CanvasAssets, urls: readonly string[]): Promise<LocalFonts | null> {
  const lookup = a.host?.fonts;
  if (!lookup || !urls.length) return Promise.resolve(null);
  const key = urls.join("\n");
  let p = a.fonts.get(key);
  if (!p) {
    p = lookup(urls)
      // Pull the above-the-fold faces into the HTTP cache BEFORE the first frame is written, so the canvas
      // document finds them cached and paints in the site font on its very first frame.
      .then(async (j) => {
        if (j) await Promise.all(j.preload.map((h) => fetch(h).then((r) => r.arrayBuffer()).catch(() => null)));
        return j;
      })
      .catch(() => null)
      .then((j) => (j || a.fonts.delete(key), j));
    a.fonts.set(key, p);
  }
  return p;
}

/** The zone when this runtime can format in it; else undefined (the engine's UTC). */
function knownZone(tz: string | null | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** The default: the core's configuration (tags, filters, data sources) over `editor.data`, styled by the host's `canvasHost`. */
export function defaultCanvasRender(store: Store, canvasHost: CanvasHost | null = null): CanvasRender {
  const a = assetsOf(store, canvasHost);
  const host = canvasHost?.host ?? NEUTRAL_HOST;
  return async (state, path) => {
    let r = a.renderers.get(state.config);
    if (!r) {
      r = createRendererFromConfiguration(state.config, { files: (p) => store.state.files.get(p), host, timezoneOffset: knownZone(canvasHost?.timezone) });
      a.renderers.set(state.config, r);
    }
    // Sample/connector data for repeaters comes from the host; merge the editor's own data over it.
    const data: Record<string, unknown> = { ...(await canvasHost?.data?.()), ...((store as Store & { data?: Record<string, unknown> }).data ?? {}) };
    // A detail page (`/product/:handle`) has no URL here: stand in the first row's value so the page renders a row, not nothing.
    data.request ??= sampleRequest(state.files.get(path) ?? "", data);
    // The site's compiled Tailwind + its theme. INLINE both (not an async <link>), so the page paints
    // styled on the first write — no flash of unstyled content. Await the CSS on first render; after
    // that use the cached copy and refresh in the background so edits that add classes still land.
    const css = !canvasHost?.siteCss ? "" : a.css ? (void refreshSiteCss(a, state).catch(() => null), a.css) : await refreshSiteCss(a, state);
    let html = await renderCanvas(await r, state, path, data);
    // A sample/unset item image resolves to an empty `src` (the `image_url` filter returns "" for an
    // empty id — correct for publish, where the template guards it). In the editor that paints a broken
    // image, so give empty img srcs the neutral placeholder. Editor-only — the published output is unchanged.
    html = html.replace(/(<img\b[^>]*\bsrc=)(""|'')/g, `$1"${PLACEHOLDER_IMAGE}"`);
    const { css: theme, urls: fontUrls } = splitThemeFonts(store.state.files.get("theme.css") ?? "");
    const fonts = await localFontsFor(a, fontUrls);
    return (
      fontHeadTags(fontUrls, fonts) +
      (css ? `<style id="site-css">${css}</style>` : "") +
      (theme ? `<style id="site-theme">${theme}</style>` : "") +
      `\n${html}`
    );
  };
}
