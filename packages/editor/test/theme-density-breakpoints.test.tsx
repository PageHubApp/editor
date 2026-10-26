/**
 * The Theme panel writes the variables the stylesheet compiler reads: density as `--spacing-density` (the
 * multiplier the `space-*` tokens use; `--spacing` is overridden by the compiled `:root`), breakpoint widths as
 * `--ph-bp-*`. Both go into `:root`, never an `@theme` block (inert in a published theme.css).
 */
import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEditor } from "@pagehub/engine/testing";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { editorKit, Slot } from "../src/index.ts";
import { readTheme, setThemeVar, themeVarsCss, DENSITY_VAR } from "../src/features/theme/themeModel.ts";
import { render, withEditor } from "./harness.tsx";

const THEME = ":root {\n  --color-primary: red;\n}\n";

function themeEditor(theme = THEME) {
  return createTestEditor({ files: { "index.liquid": "<p>x</p>", "theme.css": theme }, extensions: [htmlKit(), tailwindKit(), editorKit()] });
}

describe("theme model", () => {
  it("density is read from --spacing-density (unitless); --spacing is not density", () => {
    assert.equal(readTheme(":root{--spacing-density:1.5;}").density, 1.5);
    assert.equal(readTheme(":root{--spacing:.5rem;}").density, null);
    assert.equal(readTheme(THEME).density, null);
  });

  it("a new declaration goes in :root, not @theme", () => {
    assert.equal(setThemeVar(THEME, DENSITY_VAR, "2"), ":root {\n  --spacing-density: 2;\n  --color-primary: red;\n}\n");
    assert.equal(setThemeVar("", DENSITY_VAR, "2"), ":root {\n  --spacing-density: 2;\n}\n");
  });

  it("the live canvas reflection sets --spacing-density, never --spacing", () => {
    const css = themeVarsCss(readTheme(":root{--spacing-density:2;}"));
    assert.match(css, /--spacing-density: 2;/);
    assert.doesNotMatch(css, /--spacing:/);
  });
});

describe("Theme panel", () => {
  it("the Density slider writes --spacing-density and no --spacing", async () => {
    const e = themeEditor();
    const r = render(withEditor(e, <Slot name="ThemePanel" open onClose={() => {}} />));
    await r.type(r.get('input[aria-label="Density"]'), "2");
    const css = e.state.files.get("theme.css")!;
    assert.match(css, /--spacing-density: 2;/);
    assert.doesNotMatch(css, /--spacing:/);
    r.unmount();
  });

  it("a breakpoint edit writes --ph-bp-*, the variable the compiler reads", () => {
    const e = themeEditor();
    assert.equal(e.run("theme.setBreakpoint", { breakpoint: "md", px: 900 }), true);
    assert.equal(e.state.files.get("theme.css"), ":root {\n  --ph-bp-md: 900px;\n  --color-primary: red;\n}\n");
  });
});
