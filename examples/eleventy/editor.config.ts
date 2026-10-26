/**
 * The Eleventy site needs three things the engine doesn't ship: the `url` filter, Eleventy's data
 * (`_data/*.json`, `collections.post` read from the posts' front matter) and a canvas that applies
 * front matter and layouts. All three live in `eleventy.ts`.
 */
import { type Configuration, type EditorState } from "@pagehub/engine";
import { createRendererFromConfiguration, type Renderer } from "@pagehub/engine/render";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import type { ExampleConfig } from "../_shared/types.ts";
import { renderEleventyPage, siteData, url } from "./eleventy.ts";

const config: ExampleConfig = ({ files }) => {
  const renderers = new WeakMap<Configuration, Promise<Renderer>>();
  let current: EditorState | null = null; // the renderer is cached per configuration; it reads whichever state is rendering
  const data = siteData(files);
  return {
    extensions: [htmlKit(), tailwindKit(), liquidKit(), url],
    data,
    canvasRender: async (state, path) => {
      current = state;
      let r = renderers.get(state.config);
      if (!r) {
        r = createRendererFromConfiguration(state.config, { files: (p) => current!.files.get(p) });
        renderers.set(state.config, r);
      }
      return renderEleventyPage(await r, state, path, data);
    },
  };
};
export default config;
