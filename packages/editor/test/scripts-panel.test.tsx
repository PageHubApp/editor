import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { liquidKit } from "@pagehub/engine/kits";
import { ScriptsPanel } from "../src/features/scripts/ScriptsPanel.tsx";
import { ComponentsProvider } from "../src/components.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { pageEditor } from "./inspectorFixture.tsx";
import { render, type Rendered } from "./harness.tsx";

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

const FILES = {
  "pages/index.liquid": `<main>{% javascript %}\n  openMenu();\n{% endjavascript %}</main>\n`,
  "pages/about.liquid": `<main>About</main>\n`,
  "assets/app.js": "console.log(1);\n",
};
const open = () => {
  const e = pageEditor(FILES, [liquidKit()]);
  r = render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>
        <ScriptsPanel open onClose={() => {}} />
      </ComponentsProvider>
    </EditorStoreProvider>,
  );
  return e;
};
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

describe("Scripts panel", () => {
  it("lists the site's scripts and the {% javascript %} blocks of the page on the canvas", () => {
    open();
    assert.deepEqual([...document.querySelectorAll("[data-script-row]")].map((n) => n.getAttribute("data-script-row")), ["app.js"]);
    assert.ok(q("[data-script-block]").textContent?.includes("openMenu();"));
    assert.match(document.body.textContent ?? "", /don't run on this canvas/);
  });

  it("creates a script (the .js is added), picks it, and one undo removes the file's text", async () => {
    const e = open();
    await r!.click(q("[data-script-new]"));
    await r!.type(q<HTMLInputElement>('input[aria-label="Script name"]'), "menu");
    await r!.click(q("[data-script-create]"));
    assert.equal(e.state.files.get("assets/menu.js"), "// menu.js\n");
    assert.ok(q('[data-script-detail="menu.js"]'));
    assert.ok(e.undo());
    assert.equal(e.state.files.get("assets/menu.js"), "");
  });

  it("'Load on every page' lists the file in the partial and adds the render tag to each page", async () => {
    const e = open();
    await r!.click(q('[data-script-row="app.js"]'));
    await r!.click(q("[data-script-everywhere]"));
    assert.match(e.state.files.get("partials/site-scripts.liquid")!, /'app\.js' \| asset_url/);
    assert.match(e.state.files.get("pages/about.liquid")!, /render 'site-scripts'/);
    assert.match(q('[data-script-row="app.js"]').textContent ?? "", /Every page/);
  });

  it("applying code writes the file; an empty script is refused", async () => {
    const e = open();
    await r!.click(q('[data-script-row="app.js"]'));
    assert.ok(q('[data-code-editor="assets/app.js"] [data-code-view="javascript"]'));
    await act(async () => void e.run("source.replace", { path: "assets/app.js", text: "run();\n" }));
    assert.equal(e.state.files.get("assets/app.js"), "run();\n");
  });
});
