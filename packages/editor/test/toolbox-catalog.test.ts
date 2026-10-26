import assert from "node:assert/strict";
import { test } from "node:test";

import { TOOLBOX_EXCLUDED, presetKey, toolboxTiles } from "../src/features/add/toolboxCatalog";
import { TOOLBOX_PRESETS } from "../src/features/add/toolboxPresets.generated";

test("every item of the old toolbox is a tile, or is excluded with the tile that covers it", () => {
  const tiled = new Set(toolboxTiles().map((t) => t.key));
  const missing = TOOLBOX_PRESETS.filter((p) => !tiled.has(`preset:${presetKey(p)}`) && !(presetKey(p) in TOOLBOX_EXCLUDED)).map(presetKey);
  assert.deepEqual(missing, []);
});

test("an exclusion names a real old item, and every tile inserts markup", () => {
  const keys = new Set(TOOLBOX_PRESETS.map(presetKey));
  assert.deepEqual(Object.keys(TOOLBOX_EXCLUDED).filter((k) => !keys.has(k)), []);
  for (const t of toolboxTiles()) assert.ok((t.insert as { snippet?: string }).snippet?.trim(), `${t.key} has no snippet`);
  assert.equal(new Set(toolboxTiles().map((t) => t.key)).size, toolboxTiles().length);
});

test("the old toolbox's headline items are there", () => {
  const labels = new Set(toolboxTiles().map((t) => t.label));
  for (const l of ["Row", "Column", "Tabs", "Accordion", "Modal", "Table", "Navbar", "Divider", "Spacer", "Video", "Audio", "Map", "MapPoint", "MapPath", "Calendly", "Contact Form", "Select", "Image Carousel", "Two columns", "Large Icon", "Data"]) assert.ok(labels.has(l), l);
});
