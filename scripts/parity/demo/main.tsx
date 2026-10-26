/**
 * Parity demo host: the editor over memory storage on the fixture page. Exposes `window.__ph`
 * so scripted steps can drive it: `ready` (resolves when the editor is open), `editor`,
 * `select(selector)`, `run(command, args)`, `dirty()` (an edit that needs saving), `mode` (how the
 * storage answers a write: `ok`, `slow`, `fail`) and `external()` (another writer changes the file).
 */
import { createRoot } from "react-dom/client";
import { defineCommand, memoryStorage, type Editor as Core } from "@pagehub/engine";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { blockSourceFacet, fontPairingsFacet, iconCatalogueFacet, mediaFacet, memoryIconCatalogue, memoryMediaStore, themePresetsFacet } from "@pagehub/engine/host";
import { Editor } from "@pagehub/editor";

// A host registers `site.publish` to light the top bar's Publish pill; this demo's is a no-op.
const publishCommand = defineCommand({ id: "site.publish", title: "Publish", run: () => true });
import { FIXTURE, FIXTURE_PATH, FIXTURE_FILES } from "./fixture.ts";
import { MEDIA_FILES } from "./mediaFixture.ts";
import { DEMO_BLOCKS, DEMO_ICONS, DEMO_ICON_COMMON, DEMO_MEDIA_FOLDERS, DEMO_MEDIA_ITEMS } from "./demoData.ts";
import { DEMO_THEME_PRESETS, DEMO_FONT_PAIRINGS } from "./themePresets.ts";

// The host-supplied data the Add → Blocks, Media and Icon pickers browse (all in-memory for the demo).
const demoFacets = [
  blockSourceFacet.of(DEMO_BLOCKS),
  mediaFacet.of(memoryMediaStore({ items: DEMO_MEDIA_ITEMS, folders: DEMO_MEDIA_FOLDERS })),
  iconCatalogueFacet.of(memoryIconCatalogue(DEMO_ICONS, DEMO_ICON_COMMON)),
  // The Theme panel's Presets + font-pairing catalogue (host data, like list_presets).
  themePresetsFacet.of(DEMO_THEME_PRESETS),
  fontPairingsFacet.of(DEMO_FONT_PAIRINGS),
];

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle("dark", theme === "dark");

let resolveReady!: (e: Core) => void;
const ready = new Promise<Core>((r) => (resolveReady = r));
const api = {
  ready,
  editor: null as Core | null,
  select(selector: string) {
    const e = api.editor!;
    const h = e.find(FIXTURE_PATH, selector)[0];
    if (!h) throw new Error(`no node matches ${selector}`);
    e.select(h);
  },
  run(id: string, args?: unknown) {
    return api.editor!.run(id, args);
  },
  mode: "ok" as "ok" | "slow" | "fail",
  dirty() {
    api.select("h1");
    api.run("text.setInner", { source: "Plants for quiet rooms" });
  },
  external() {
    memory.external(FIXTURE_PATH, FIXTURE.replace("Plants for slow rooms", "Plants for loud rooms"));
  },
};
(window as unknown as { __ph: typeof api }).__ph = api;

const files = params.get("fixture") === "media" ? MEDIA_FILES : FIXTURE_FILES;
const memory = memoryStorage(params.get("empty") ? { [FIXTURE_PATH]: "" } : files);
const storage = {
  ...memory,
  async write(...args: Parameters<typeof memory.write>) {
    if (api.mode === "slow") await new Promise((r) => setTimeout(r, 60_000));
    if (api.mode === "fail") throw new Error("disk full");
    return memory.write(...args);
  },
};
createRoot(document.getElementById("root")!).render(
  <Editor
    storage={storage}
    extensions={[htmlKit(), tailwindKit(), liquidKit(), publishCommand, ...demoFacets]}
    // the diff preview renders in the flow under the canvas today and squeezes the editor to a third of the viewport
    components={{ DiffPreview: null }}
    onReady={(e) => {
      api.editor = e;
      resolveReady(e);
    }}
  />,
);
