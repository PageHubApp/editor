import "./setup.ts";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTestEditor } from "@pagehub/engine/testing";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { editorKit } from "../src/index.ts";
import { TextValueControl } from "../src/features/inspector/controls/element/TextValueControl.tsx";
import { render, withEditor, type Rendered } from "./harness.tsx";

const ICON = `<span aria-hidden="true">{{ "tb/TbMenu2" | icon }}</span>`;
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

describe("button Text control", () => {
  it("an icon-only button reads as empty, and typing a label keeps the icon span", async () => {
    const e = createTestEditor({ files: { "index.liquid": `<button type="button" commandfor="nav">${ICON}</button>\n` }, extensions: [htmlKit(), tailwindKit(), editorKit()] });
    r = render(withEditor(e, <TextValueControl handle={e.get("button")} row={{} as never} />));
    const input = r.get<HTMLInputElement>("#input-component-text, #component-text, input");
    assert.equal(input.value, "", "no markup in the field");
    await r.type(input, "Menu");
    assert.equal(e.text(), `<button type="button" commandfor="nav">${ICON} Menu</button>\n`);
  });
});
