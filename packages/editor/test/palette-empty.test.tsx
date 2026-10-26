import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { contributes } from "@pagehub/engine";
import { createTestEditor } from "@pagehub/engine/testing";
import { CommandPalette } from "../src/features/palette/CommandPalette.tsx";
import { chromeField, chromeOf, paletteToggle, paletteClose } from "../src/shell/chromeState.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { render, withEditor } from "./harness.tsx";
import { wait } from "./keys.ts";

afterEach(() => {
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

// the core commands are listed only where their palette `when` holds: here none does
const contextual = contributes({ palette: ["history.undo", "history.redo", "file.save"].map((command) => ({ command, when: "role == 'nobody'" })) });

describe("command palette: empty states", () => {
  it("with no command available in this context it says so", async () => {
    // only the chrome's own (hidden) palette commands: nothing to list
    const e = createTestEditor({ files: { "index.liquid": "<p>x</p>\n" }, extensions: [chromeField, paletteToggle, paletteClose, contextual] });
    const r = render(withEditor(e, <CommandPalette />));
    await act(async () => void e.run("palette.toggle"));
    await wait(300);
    assert.equal(chromeOf(e.state).paletteOpen, true);
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.match(dialog.textContent!, /No commands available in this context\./);
    assert.equal(document.body.querySelectorAll('[role="option"]').length, 0);
    r.unmount();
  });
});
