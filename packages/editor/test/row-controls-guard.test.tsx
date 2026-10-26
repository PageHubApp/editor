// Guard: every popover row (and every row with a custom control) opens a real editor, never a
// single bare text input — the stub editors ("Condition" text box, one empty field) Will found.
import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { liquidKit } from "@pagehub/engine/kits";
import { ComponentsProvider } from "../src/components.ts";
import { RowControl } from "../src/features/inspector/PropertyRow.tsx";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { render, type Rendered } from "./harness.tsx";
import { pageEditor, select } from "./inspectorFixture.tsx";

/**
 * Rows where a single text field IS the right control, each with why. Keep this short: a new
 * popover row belongs here only if a person would type one free-form value and nothing else.
 */
const BARE_TEXT_OK: ReadonlySet<string> = new Set([
  // (none today: every popover / custom row has a structured control)
]);

/** Rows checked besides the popover ones: those RowControl gives a custom control. */
const CUSTOM_ROWS = ["permissions", "aiContext", "stateBinding", "state.text", "image.src", "alt", "importExport"];

/** Which fixture element to render each row against (its component type must allow the row). */
const TARGET: Record<string, string> = { "state.text": "h1", stateBinding: "input", "image.src": "img", alt: "img" };

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

describe("row controls are never a single bare text input", () => {
  const rows = inspectorRows().filter((row) => (row.popover || CUSTOM_ROWS.includes(row.id)) && (!process.env.GUARD_ONLY || process.env.GUARD_ONLY.split(",").includes(row.id)));
  if (!process.env.GUARD_ONLY) it("covers every popover row", () => assert.ok(rows.filter((x) => x.popover).length >= 24, `${rows.length} rows`));
  for (const row of rows) {
    it(row.id, () => {
      const e = pageEditor(undefined, [liquidKit()]);
      const sel = TARGET[row.id] ?? "section";
      select(e, sel);
      r = render(
        <EditorStoreProvider store={e}>
          <ComponentsProvider value={DEFAULT_COMPONENTS}>
            <RowControl row={row} handle={e.get(sel)} />
          </ComponentsProvider>
        </EditorStoreProvider>,
      );
      const c = r.container;
      const texts = c.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], textarea');
      const other = c.querySelectorAll('button, select, [role="radio"], [role="listbox"], [role="switch"], input[type="checkbox"], input[type="range"], input[type="number"]');
      assert.ok(!c.querySelector("[data-row-structure]"), `${row.id}: falls back to a structure note`);
      const bare = texts.length <= 1 && other.length === 0;
      if (BARE_TEXT_OK.has(row.id)) return;
      assert.ok(!bare, `${row.id}: a single bare text input (${texts.length} text, ${other.length} other controls)`);
    });
  }
});
