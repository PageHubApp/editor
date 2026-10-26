/**
 * What the store needs on top of HTML + Liquid: the data sources, the media library and a canvas
 * renderer that has the host providers (`image_url`, `icon`), the form handler and the setting
 * resolver. Open as the owner, or add `?role=client` for content mode.
 */
import { type Configuration, type EditorState } from "@pagehub/engine";
import { createRendererFromConfiguration, type Renderer } from "@pagehub/engine/render";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { renderCanvas } from "@pagehub/engine/canvas";
import type { ExampleConfig } from "../_shared/types.ts";
import { canvasData, dataSources, formHandler, host, mediaLibrary, parseCatalog, resolveSetting } from "./store.ts";

const config: ExampleConfig = ({ files }) => {
  const catalog = parseCatalog(files["catalog.json"]!);
  const renderers = new WeakMap<Configuration, Promise<Renderer>>();
  let current: EditorState | null = null; // the renderer is cached per configuration; it reads whichever state is rendering
  return {
    extensions: [htmlKit(), tailwindKit(), liquidKit(), dataSources(catalog), mediaLibrary(catalog)],
    data: canvasData(catalog),
    canvasRender: async (state, path) => {
      current = state;
      let r = renderers.get(state.config);
      if (!r) {
        r = createRendererFromConfiguration(state.config, { files: (p) => current!.files.get(p), host, formHandler, resolveSetting: resolveSetting(catalog) });
        renderers.set(state.config, r);
      }
      return renderCanvas(await r, state, path, canvasData(catalog));
    },
  };
};
export default config;
