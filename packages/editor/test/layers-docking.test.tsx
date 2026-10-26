import "./setup.ts";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { commandsFacet, menusFacet } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { layersDockedOf } from "../src/features/layers/layersKit.ts";
import { LayersPanel } from "../src/features/layers/LayersPanel.tsx";
import { render, withEditor, actRun, type Rendered } from "./harness.tsx";

const LAYOUT = `<section><p>shared</p></section>\n`;
const PAGE = `<section><p>own</p></section>\n`;

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
  localStorage.clear();
});

function setup(): { e: TestEditor; r: Rendered } {
  const e = createTestEditor({ files: { "index.liquid": PAGE, "layouts/theme.liquid": LAYOUT }, extensions: [htmlKit(), tailwindKit(), editorKit()] });
  const r = render(withEditor(e, <LayersPanel />));
  open.push(r);
  return { e, r };
}

const dialog = () => document.querySelector<HTMLElement>("[data-ph-floating-panel='layers-dialog']");

describe("layers: layout sections, docking and pop-out", () => {
  it("a section of a layout file gets the amber world icon and its tooltip; a page section keeps the section icon", async () => {
    const { e, r } = setup();
    const icons = () => r.all("[data-layer-row][data-layer-kind=section] [data-layer-icon]");
    assert.equal(icons()[0]!.getAttribute("data-layer-icon"), "section");
    actRun(e, "canvas.set", { page: "layouts/theme.liquid" });
    await act(async () => {});
    const icon = icons()[0]!;
    assert.equal(icon.getAttribute("data-layer-icon"), "world");
    assert.ok(icon.className.includes("text-amber-500"));
    assert.match(icon.getAttribute("data-tooltip-content") ?? "", /^Sits outside the page, so it shows on every page/);
  });

  it("More › View lists 'Pop out layers' and the dock toggle; the docked state toggles and persists (the tab always shows the tree)", async () => {
    const { e, r } = setup();
    const rows = e.state.facet(menusFacet)["more/view"]!.map((m) => m.command);
    assert.ok(rows.includes("panel.layers") && rows.includes("layers.toggleDocked"));
    assert.ok(e.state.facet(commandsFacet).has("layers.toggleDocked"));
    assert.ok(r.get("[data-layer-tree]"));
    actRun(e, "layers.toggleDocked");
    assert.equal(layersDockedOf(e.state), false);
    assert.ok(r.get("[data-layer-tree]"), "the Layers tab keeps its tree");
    assert.equal(localStorage.getItem("pagehub-editor:sidebar-layers-panel"), "false");
    actRun(e, "layers.toggleDocked");
    assert.equal(layersDockedOf(e.state), true);
  });

  it("pop-out dialog: 340×500 (min 280×300, max 600×700), z 70, docked to the sidebar's edge, size persisted under layers-dialog", async () => {
    const { e } = setup();
    actRun(e, "panel.layers");
    await act(async () => {});
    const d = dialog()!;
    assert.equal(d.style.width, "340px");
    assert.equal(d.style.height, "500px");
    assert.deepEqual([d.style.minWidth, d.style.minHeight, d.style.maxWidth, d.style.maxHeight], ["280px", "300px", "600px", "700px"]);
    assert.equal(d.style.zIndex, "70");
    assert.equal(d.style.left, "8px", "the sidebar is on the left, so the dialog docks left");
    actRun(e, "panel.layers");
    actRun(e, "sidebar.toggleSide");
    actRun(e, "panel.layers");
    await act(async () => {});
    assert.ok(parseInt(dialog()!.style.left) > 8, "sidebar on the right → dialog docks right");
    actRun(e, "panel.layers");
    localStorage.setItem("pagehub-editor:resizable-layers-dialog", JSON.stringify({ width: 420, height: 410 }));
    actRun(e, "panel.layers");
    await act(async () => {});
    assert.equal(dialog()!.style.width, "420px");
  });
});
