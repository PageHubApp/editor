/**
 * Live preview: Preview mode with the site's own JavaScript running (docs/action-items/specs/site-js-allowed.md).
 *
 * The editing canvas is a same-origin, script-inert frame the editor reaches into. The live preview is a SEPARATE
 * frame whose `src` is the host's `previewUrl(route)` (the saved draft, rendered by the host's preview route), so
 * the site's scripts run there and never in the editor's realm:
 *
 * - A preview on another origin (a per-site preview host) is cross-origin already; its sandbox keeps it from
 *   navigating the editor's tab and keeps its own origin (`allow-same-origin` names ITS origin, not the editor's).
 * - A preview on the editor's own origin (local dev without a preview host) is sandboxed WITHOUT `allow-same-origin`:
 *   an opaque origin, so author code can't touch the editor, its cookies or its storage. `liveFrameSandbox` is the
 *   one place that decides, and it never grants `allow-same-origin` to a same-origin URL.
 *
 * No DOM access crosses the boundary. The frame's page reports `{ type: "ph-live-location", path, y }` (its path and
 * scroll, from the host's preview bridge) and accepts `{ type: "ph-live-scroll", y }`. Both directions are untrusted:
 * `readLiveMessage` checks the sender window, its origin and the message shape, and the path must stay under the
 * preview's own base path.
 *
 * Edits reach the preview by saving: entering live mode saves pending edits first, and every save reloads the frame
 * at the page and scroll position it was on.
 */
import { StateEffect, StateField, contributes, defineCommand, effectsOf, setSelection, type EditorState, type Extension } from "@pagehub/engine";
import { chromeField, setChrome } from "../../shell/chromeState";

export const setLivePreview = StateEffect.define<boolean>("livePreview.set");

/** Whether Preview runs the site's scripts (the live frame) instead of showing the inert canvas. Session-only. */
export const livePreviewField = StateField.define<boolean>({
  name: "livePreview",
  create: () => false,
  update(value, tr) {
    const v = effectsOf(tr, setLivePreview);
    return v.length ? v[v.length - 1]! : value;
  },
});

export const livePreviewOf = (state: EditorState): boolean => state.hasField(livePreviewField) && state.field(livePreviewField);

/** Toggle site scripts in Preview. Turning it on from edit mode enters Preview too (clearing the selection, as Preview does). */
const livePreviewToggle = defineCommand({
  id: "preview.live",
  title: "Preview with site scripts",
  run(ctx) {
    if (!ctx.state.hasField(livePreviewField) || !ctx.state.hasField(chromeField)) return false;
    const on = !ctx.state.field(livePreviewField);
    const c = ctx.state.field(chromeField);
    ctx.tr.effect(setLivePreview, on);
    if (on && !c.preview) {
      ctx.tr.effect(setChrome, { preview: true, previewSelection: ctx.selection.handles, contextMenu: null, drawer: null, detail: null });
      ctx.tr.effect(setSelection, { handles: [] });
    }
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

export function livePreviewKit(): Extension {
  return KIT;
}
const KIT: Extension = [livePreviewField, livePreviewToggle, contributes({ palette: [{ command: "preview.live", group: "View" }] })];

/**
 * The sandbox for a live frame at `src`, seen from a page at `pageHref`. Same origin → never `allow-same-origin`,
 * and its popups stay sandboxed too (an escaped popup would be the preview page on the editor's origin, unsandboxed).
 * Never `allow-top-navigation`: the site's scripts can't move the editor's tab.
 */
export function liveFrameSandbox(src: string, pageHref: string): string {
  const base = "allow-scripts allow-forms allow-popups";
  return isCrossOrigin(src, pageHref) ? `${base} allow-popups-to-escape-sandbox allow-same-origin` : base;
}

/** The `origin` messages from that frame carry: its own when cross-origin, `"null"` (opaque) when sandboxed on ours. */
export function liveFrameOrigin(src: string, pageHref: string): string {
  return isCrossOrigin(src, pageHref) ? new URL(src, pageHref).origin : "null";
}

function isCrossOrigin(src: string, pageHref: string): boolean {
  try {
    return new URL(src, pageHref).origin !== new URL(pageHref).origin;
  } catch {
    return false;
  }
}

export interface LiveLocation {
  /** Path and query inside the preview, always under the preview's base path. */
  path: string;
  /** Scroll offset, clamped to a sane range. */
  y: number;
}

/**
 * A `ph-live-location` message from the live frame, or null for anything else: another window, another origin,
 * a wrong shape, a path outside `basePath` (`/view/<site>`).
 */
export function readLiveMessage(
  e: { data: unknown; origin: string; source: unknown },
  expect: { source: unknown; origin: string; basePath: string },
): LiveLocation | null {
  if (!expect.source || e.source !== expect.source || e.origin !== expect.origin) return null;
  const d = e.data as { type?: unknown; path?: unknown; y?: unknown } | null;
  if (!d || typeof d !== "object" || d.type !== "ph-live-location") return null;
  if (typeof d.path !== "string" || d.path.length > 2048 || !isUnder(d.path, expect.basePath)) return null;
  const y = typeof d.y === "number" && Number.isFinite(d.y) ? Math.min(Math.max(0, Math.round(d.y)), 1_000_000) : 0;
  return { path: d.path, y };
}

function isUnder(path: string, base: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return false;
  if (path === base) return true;
  return [`${base}/`, `${base}?`, `${base}#`].some((p) => path.startsWith(p));
}

/** The route (`/about`) a preview path names, given the preview's base path; null when it names none. */
export function routeOfLivePath(path: string, basePath: string): string | null {
  if (!isUnder(path, basePath)) return null;
  const rest = path.slice(basePath.length).split(/[?#]/)[0]!;
  return rest === "" || rest === "/" ? "/" : rest.replace(/\/+$/, "");
}

/** The base path of a preview URL for the home route (`https://k.preview.x/view/k` → `/view/k`). */
export function liveBasePath(homeUrl: string, pageHref: string): string {
  try {
    return new URL(homeUrl, pageHref).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}
