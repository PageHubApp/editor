/**
 * The editor's canvas host backed by the dev server (`vitePlugin.ts`): the site's compiled Tailwind (`/__site.css`),
 * self-hosted fonts (`/__fonts`), the runtime module (`/__runtime.js`), the chrome-free page (`/~view/<site>/…`), and
 * the filter providers / sample data read from the site's own `site.json`, `icons.json` and `data.json`. Every
 * request names this tab's site (`?site=<id>`), so tabs never share state.
 */
import type { CanvasHost } from "@pagehub/editor";
import type { LocalFonts } from "@pagehub/engine/canvas";
import { localHost } from "../localHost";

export interface DevCanvasHostOptions {
  site: string | null;
  /** Reads the opened site's current source (the editor's own copy, so an edit to `data.json` shows at once). */
  files: (path: string) => string | undefined;
  /** Network waits the canvas can sit on: past these it reports an error (or falls back) instead of waiting forever. */
  cssTimeoutMs?: number;
  fontsTimeoutMs?: number;
}

/** A JSON file from the opened site's files, or {}. */
function readJson(files: DevCanvasHostOptions["files"], path: string): Record<string, any> {
  const text = files(path);
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return {};
  }
}

export function devCanvasHost({ site, files, cssTimeoutMs = 15_000, fontsTimeoutMs = 8_000 }: DevCanvasHostOptions): CanvasHost {
  const query = `site=${encodeURIComponent(site ?? "")}`;
  const providers = () => localHost({ site: readJson(files, "site.json"), icons: readJson(files, "icons.json") });
  return {
    siteCss: async () => {
      try {
        const r = await fetch(`/__site.css?${query}`, { signal: AbortSignal.timeout(cssTimeoutMs) });
        if (!r.ok) throw new Error(`site styles failed to load (${r.status})`);
        return await r.text();
      } catch (e) {
        throw e instanceof Error && e.name === "TimeoutError" ? new Error("site styles timed out") : e;
      }
    },
    // `block`, not `optional`: the canvas document is rewritten on every edit, and a face that missed the
    // first paint must not stay a fallback for the rest of that frame.
    fonts: async (urls) => {
      const qs = urls.map((u) => `u=${encodeURIComponent(u)}`).join("&") + "&display=block";
      const r = await fetch(`/__fonts?${qs}`, { signal: AbortSignal.timeout(fontsTimeoutMs) });
      const j = r.ok ? ((await r.json()) as LocalFonts & { failed?: boolean }) : null;
      return j && !j.failed ? j : null;
    },
    runtimeUrl: "/__runtime.js",
    previewUrl: (route) => `/~view${site ? `/${encodeURIComponent(site)}` : ""}${route}`,
    // read per call: the providers must see an edit to `site.json` / `icons.json` made in this session
    host: {
      imageUrl: (id) => providers().imageUrl(id),
      fileUrl: (name) => providers().fileUrl(name),
      icon: (ref) => providers().icon(ref),
    },
    data: () => readJson(files, "data.json"),
  };
}
