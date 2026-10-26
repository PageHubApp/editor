/** The picker's palette comes from the site's theme.css the way the canvas cascades it: light base scope, dark overlay. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseThemePalette } from "../src/features/theme/themePalette.ts";

const NAMES = ["primary", "base-100"];
const CSS = `
:root { --color-primary: oklch(49% 0.07 134); --color-base-100: oklch(100% 0 0); --pot: #c97b4a; --color-pot-terracotta: var(--pot); }
@media (prefers-color-scheme: dark) { :root { --color-primary: oklch(92% 0 0); --color-base-100: oklch(14% 0 0); } }
.dark :root, :root.dark { --color-primary: oklch(92% 0 0); --color-base-100: oklch(14% 0 0); }
`;

describe("parseThemePalette", () => {
  it("the light palette is the base scope; a later dark block never overrides it", () => {
    const { light } = parseThemePalette(CSS, NAMES);
    assert.equal(light.get("primary"), "oklch(49% 0.07 134)");
    assert.equal(light.get("base-100"), "oklch(100% 0 0)");
  });

  it("the dark palette lays @media dark and .dark scopes over the light one; untouched tokens carry over", () => {
    const { dark } = parseThemePalette(CSS, NAMES);
    assert.equal(dark.get("primary"), "oklch(92% 0 0)");
    assert.equal(dark.get("base-100"), "oklch(14% 0 0)");
    assert.equal(dark.get("pot-terracotta"), "#c97b4a");
  });

  it("custom --color-* tokens are listed and var() references resolve", () => {
    const { light } = parseThemePalette(CSS, NAMES);
    assert.equal(light.get("pot-terracotta"), "#c97b4a");
  });

  it("a token declared only as --<name> still counts; legacy --color-dark-* is the dark palette", () => {
    const { light, dark } = parseThemePalette(":root { --primary: #123456; --color-dark-primary: #fedcba; }", NAMES);
    assert.equal(light.get("primary"), "#123456");
    assert.equal(dark.get("primary"), "#fedcba");
    assert.equal(light.has("dark-primary"), false);
  });

  it("no css → empty palettes", () => {
    const p = parseThemePalette(undefined, NAMES);
    assert.equal(p.light.size + p.dark.size, 0);
  });
});
