import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { groupTest, splitClass } from "@pagehub/engine";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { CONTROL_SPECS, controlSpecFor, type BundleItemSpec } from "../src/features/inspector/controlSpecs.tsx";
import { RowControl } from "../src/features/inspector/PropertyRow.tsx";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { activeTextStyle, typographyPresets } from "../src/features/theme/typographyPresets.ts";
import { fixtureEditor, render, withEditor } from "./harness.tsx";

const live: ReturnType<typeof render>[] = [];
afterEach(() => void live.splice(0).forEach((r) => r.unmount()));
const mount = (ui: React.ReactNode) => (live.push(render(ui)), live.at(-1)!);
const row = (id: string) => inspectorRows().find((r) => r.id === id)!;
const cls = (e: ReturnType<typeof fixtureEditor>, sel = "h1") => e.get(sel).attr("class") ?? "";

describe("row → control mapping", () => {
  it("Text style is the text-style picker and Spacing a three-part bundle (Line height, Tracking, Indent)", () => {
    assert.equal(controlSpecFor("typographyPreset")?.kind, "textStyle");
    const s = CONTROL_SPECS.spacing;
    assert.equal(s?.kind, "bundle");
    assert.deepEqual((s as { items: BundleItemSpec[] }).items.map((i) => i.group), ["leading", "tracking", "indent"]);
  });

  it("lineHeight / tracking / indent are parts of Spacing, not rows of their own", () => {
    const ids = inspectorRows().map((r) => r.id);
    for (const k of ["lineHeight", "tracking", "indent"]) assert.ok(!ids.includes(k), k);
    assert.ok(ids.includes("spacing"));
  });

  it("every old select / bundle / options row has a real control spec, not a bare text field", () => {
    const degraded = [
      "cursor", "zIndex", "order", "visibility", "pointerEvents", "userSelect", "float", "verticalAlign", "fontSmoothing", "resize", "touchAction", "boxSizing", "isolation",
      "columns", "captionSide", "srOnly", "aspectRatio", "textDecoration", "bgClip", "backgroundRepeat", "backgroundSize", "backgroundOrigin", "backgroundPosition", "backgroundAttachment",
      "hover.scale", "hover.shadow", "hover.opacity", "hover.translateY", "hover.ring", "gridSpan", "place", "divide", "outline", "blend", "break", "list", "table", "svg",
    ];
    for (const id of degraded) assert.ok(CONTROL_SPECS[id], `${id} has a control spec`);
  });

  it("every option a spec offers is a token its class group accepts", () => {
    const e = fixtureEditor();
    const groups = e.state.facet(classGroupsFacet);
    const check = (id: string, group: string, opts: readonly string[] | undefined) => {
      const g = groups.get(group);
      assert.ok(g, `${id}: group ${group} exists`);
      for (const o of opts ?? []) assert.ok(groupTest(g)(splitClass(o)[1]), `${id}: ${o} belongs to ${group}`);
    };
    for (const [id, spec] of Object.entries(CONTROL_SPECS)) {
      if (spec.kind === "bundle") {
        for (const it of spec.items) if (it.control !== "color") check(id, it.group, it.options);
      } else if (spec.kind === "universal" && spec.options) {
        const group = row(id)?.groups[0];
        if (group) check(id, group, spec.options);
      }
    }
  });
});

describe("Text style", () => {
  const CSS = `@theme {\n  --font-heading: "Lora", serif;\n  --font-body: "Inter", sans-serif;\n  --font-accent: "Pacifico", cursive;\n}\n`;
  it("lists the theme's typography tokens (Accent only when declared) plus host presets", () => {
    assert.deepEqual(typographyPresets(CSS).map((p) => p.name), ["Heading", "Body", "Accent"]);
    assert.deepEqual(typographyPresets(`@theme {\n  --font-heading: "Lora", serif;\n}\n`).map((p) => p.name), ["Heading", "Body"]);
    assert.deepEqual(typographyPresets(CSS, [{ name: "Display", className: "font-heading text-5xl" }]).map((p) => p.name).at(-1), "Display");
  });
  it("the active style is the one whose tokens are all on the element (most tokens wins)", () => {
    const styles = typographyPresets(CSS, [{ name: "Display", className: "font-heading text-5xl" }]);
    assert.equal(activeTextStyle(styles, ["font-heading", "p-4"])?.name, "Heading");
    assert.equal(activeTextStyle(styles, ["font-heading", "text-5xl"])?.name, "Display");
    assert.equal(activeTextStyle(styles, ["p-4"]), null);
  });
  it("renders a dropdown (not a text field) and picking Heading writes font-heading in place of another family", async () => {
    const e = fixtureEditor(`<section><h1 class="font-serif text-xl">Hi</h1></section>\n`);
    act(() => e.select(e.get("h1")));
    const r = mount(withEditor(e, <RowControl row={row("typographyPreset")} handle={e.get("h1")} />));
    assert.equal(r.all("input[type=text]").length, 0);
    await r.click(r.get('button[role="combobox"], button[aria-haspopup="listbox"], #input-typographyPreset'));
    const opt = r.all("[role=option]").find((o) => o.textContent === "Heading")!;
    await r.click(opt);
    assert.match(cls(e), /\bfont-heading\b/);
    assert.doesNotMatch(cls(e), /font-serif/);
    assert.match(cls(e), /text-xl/, "other classes untouched");
  });
});

describe("Spacing bundle", () => {
  it("renders three value fields and a typed token writes through its own group", async () => {
    const e = fixtureEditor(`<section><h1 class="leading-tight">Hi</h1></section>\n`);
    act(() => e.select(e.get("h1")));
    const r = mount(withEditor(e, <RowControl row={row("spacing")} handle={e.get("h1")} />));
    assert.equal(r.all("[data-bundle-control] input[type=text]").length, 3);
    const tracking = r.get<HTMLInputElement>("input[aria-label='Tracking']");
    await act(async () => void tracking.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    await r.type(tracking, "tracking-wide");
    await act(async () => void tracking.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.match(cls(e), /leading-tight/);
    assert.match(cls(e), /tracking-wide/);
  });
});

describe("colour popover", () => {
  it("leads with the site palette (before the picker and the Tailwind shades) and the row popover scrolls inside a capped height", async () => {
    const { ColorPanelBody } = await import("../src/features/pickers/ColorPanelBody.tsx");
    const r = mount(<ColorPanelBody value="" onChange={() => {}} theme={{ light: () => [{ name: "primary", color: "#336699" }] }} />);
    const text = r.container.textContent ?? "";
    assert.ok(text.indexOf("Design System") >= 0 && text.indexOf("Design System") < text.indexOf("Tailwind Colors"), "palette before the Tailwind shades");
    const palette = [...r.container.querySelectorAll("span")].find((s) => s.textContent === "Design System")!;
    const picker = r.container.querySelector(".flexbox-fix, .sketch-picker, [class*=sketch]");
    if (picker) assert.ok(palette.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING, "palette before the Sketch picker");
  });

  it("every popover row body is scrollable and its popover is collision-capped", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/features/inspector/PropertyRow.tsx", import.meta.url), "utf8");
    assert.match(src, /maxHeightCeiling=\{POPOVER_MAX_HEIGHT\}/);
    assert.match(src, /overflow-y-auto/);
  });
});
