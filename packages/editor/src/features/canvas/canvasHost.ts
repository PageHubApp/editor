/**
 * `canvasHost`: everything the canvas needs from the host that is not the site's own source. The editor
 * never fetches or hard-codes a URL itself; a host (the dev server, a dashboard) supplies these, and any
 * member left out simply isn't done: no `siteCss` paints the page with only its own `<head>`, no `fonts`
 * keeps the remote font `<link>`s, no `runtimeUrl` boots no site runtime, no `previewUrl` hides "Open in new tab".
 */
import { createContext, useContext } from "react";
import type { EditorState } from "@pagehub/engine";
import type { HostProviders } from "@pagehub/engine/render";
import type { LocalFonts } from "@pagehub/engine/canvas";
import type { PageEntry } from "../topbar/pages";

export interface CanvasHost {
  /**
   * The site's compiled stylesheet, inlined into every canvas frame. Called on each render; the editor keeps the
   * last good copy per editor and shows it when a refresh fails. With no copy yet, a throw is the render error.
   */
  siteCss?(state: EditorState): Promise<string>;
  /** Self-hosted copies of the theme's web fonts (same-origin `@font-face` + preload hrefs), or null to keep the remote links. */
  fonts?(urls: readonly string[]): Promise<LocalFonts | null>;
  /** The site runtime as one browser module, loaded into the canvas in edit mode (absolute, or relative to the editor page). */
  runtimeUrl?: string | null;
  /**
   * The chrome-free page for a route (`/about`), or null for none: "Open in new tab", and the live preview frame
   * (Preview → "Run site scripts", sandboxed; see `livePreview.ts`). It renders the SAVED draft with the site's own
   * scripts, so it should be on another origin; on the editor's own origin the frame gets an opaque origin instead.
   * The page can report `{ type: "ph-live-location", path, y }` to its parent and accept `{ type: "ph-live-scroll", y }`.
   */
  previewUrl?(route: string): string | null;
  /**
   * The site's page records (file, route, name), so the page selector shows the routes the renderer serves.
   * A page without a record falls back to the route its file path implies.
   */
  pages?(): readonly PageEntry[];
  /** `image_url` / `file_url` / `icon` filter providers for the canvas renderer. Read lazily at each call. */
  host?: HostProviders;
  /**
   * The site's IANA timezone (`America/Los_Angeles`): the zone `| date` renders in on the canvas, so it shows what the
   * published page shows. Absent or not a zone this runtime knows: UTC.
   */
  timezone?: string | null;
  /** Sample or connector data for data-bound pages, merged under `editor.data`. */
  data?(): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export const CanvasHostContext = createContext<CanvasHost | null>(null);
export const useCanvasHost = (): CanvasHost | null => useContext(CanvasHostContext);
