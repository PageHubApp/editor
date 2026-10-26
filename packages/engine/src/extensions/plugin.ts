/**
 * `definePlugin` bundles extensions under a name. `requires` lists imported values (never
 * strings) that must also be configured — checked at config time; `runtime` is the lazy
 * worker half; `contributes` is data the shell renders without loading the plugin's code.
 */
import type { Extension, PluginExtension, RuntimeExtension } from "./extension";
import { contributes, type Contributions } from "../commands/contributes";

export function definePlugin(opts: {
  name: string;
  requires?: Extension[];
  extensions?: Extension[];
  runtime?: () => Promise<{ default: RuntimeExtension[] }>;
  contributes?: Contributions;
}): Extension {
  const plugin: PluginExtension = {
    kind: "plugin",
    name: opts.name,
    requires: opts.requires ?? [],
    extensions: opts.extensions ?? [],
    runtime: opts.runtime,
    contributed: opts.contributes ? contributes(opts.contributes) : [],
  };
  return plugin;
}
