import type { EditorState, Extension, Path } from "@pagehub/engine";
import type { JsonValue } from "@pagehub/engine/render";

/** What an example's `editor.config.ts` default export resolves to. Every field is optional. */
export interface ExampleSetup {
  /** Kits and plugins. Passing a list replaces the default `[htmlKit(), tailwindKit(), liquidKit()]`, so name them. */
  extensions?: Extension;
  /** Sample data for the canvas (what a data source would return). */
  data?: Record<string, JsonValue>;
  /** Replace how the canvas renders a page. */
  canvasRender?: (state: EditorState, path: Path) => Promise<string>;
}

/** An example's config: receives the site's files as read from disk. */
export type ExampleConfig = (input: { files: Record<Path, string> }) => ExampleSetup | Promise<ExampleSetup>;
