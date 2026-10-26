/**
 * The engine, as the server code receives it. The dev server's own files run as plain Node and cannot import the
 * engine's TypeScript, so whoever starts them hands the loaded modules in: the Vite plugin loads them through
 * `server.ssrLoadModule` (an engine edit then takes effect without a restart), the CLI imports them under tsx.
 */
import type * as render from "@pagehub/engine/render";
import type * as canvas from "@pagehub/engine/canvas";
import type * as host from "@pagehub/engine/host";
import type * as fs from "@pagehub/engine/fs";
import type * as runtime from "@pagehub/site-runtime";

export type DevEngine = Pick<typeof render, "createRenderer" | "renderPage" | "matchRoute" | "defineDataSource" | "BUILTIN_OBJECTS"> &
  Pick<typeof canvas, "splitThemeFonts" | "fontHeadTags" | "parseFontFaces"> &
  Pick<typeof host, "PLACEHOLDER_IMAGE"> &
  Pick<typeof fs, "fsStorage"> &
  Pick<typeof runtime, "needsRuntime">;

/** Merge the engine's entry modules (and the runtime's) into the one object the server code takes. */
export const mergeEngine = (...modules: Partial<DevEngine>[]): DevEngine => Object.assign({}, ...modules) as DevEngine;
