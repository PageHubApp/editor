import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { contributes, defineCommand } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { chromeOf, ZOOM_PRESETS } from "../src/shell/chromeState.ts";
import { attachKeymap, isTextSurface } from "../src/features/keyboard/domKeymap.ts";
import { formatShortcut } from "../src/features/keyboard/platform.ts";
import { pushOverlay, resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { FIXTURE, fixtureEditor, render } from "./harness.tsx";
import { press } from "./keys.ts";

let detach = () => {};
let e: TestEditor;
const chrome = () => chromeOf(e.state);

beforeEach(() => {
  e = fixtureEditor();
  detach = attachKeymap(e, { platform: "other" });
});
afterEach(() => {
  detach();
  resetOverlaysForTests();
  document.body.innerHTML = "";
});

const input = (type = "text") => {
  const el = document.createElement("input");
  el.type = type;
  document.body.appendChild(el);
  return el;
};

describe("keymap on the DOM", () => {
  it("mod+Z undoes and mod+Y / shift+mod+Z redo", () => {
    e.select(e.get("h1"));
    assert.equal(press("ctrl+Delete"), false, "ctrl+Delete is not a binding");
    assert.equal(press("Delete"), true);
    assert.ok(!e.text().includes("Hello"));
    assert.equal(press("ctrl+z"), true);
    assert.ok(e.text().includes("Hello"), "undone");
    assert.equal(press("ctrl+y"), true);
    assert.ok(!e.text().includes("Hello"), "redone with mod+Y");
    press("ctrl+z");
    assert.equal(press("ctrl+shift+Z"), true);
    assert.ok(!e.text().includes("Hello"), "redone with shift+mod+Z");
  });

  it("undo / redo keys belong to the text field while editing text", () => {
    assert.equal(press("ctrl+z", input()), false);
    assert.equal(press("ctrl+y", input()), false);
  });

  it("mod+S saves through file.save, and not while editing text", async () => {
    e.select(e.get("h1"));
    press("Delete");
    assert.notEqual(e.text(), FIXTURE);
    assert.equal(press("ctrl+s", input()), false, "the field keeps its own key");
    assert.equal(press("ctrl+s"), true);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    assert.equal((await e.memory.read("index.liquid"))?.text, e.text(), "the file was written");
  });

  it("shift+mod+M / D / L / O toggle their panel (one at a time); G and H toggle grid lines and hidden components", () => {
    assert.equal(press("ctrl+shift+M"), true);
    assert.equal(chrome().panel, "media");
    press("ctrl+shift+M");
    assert.equal(chrome().panel, null, "second press closes");
    press("ctrl+shift+D");
    assert.equal(chrome().panel, "theme");
    press("ctrl+shift+L");
    assert.equal(chrome().panel, "layers", "opening another replaces it");
    press("ctrl+shift+O");
    assert.equal(chrome().panel, "modifiers");
    assert.equal(chrome().gridlines, false);
    press("ctrl+shift+G");
    assert.equal(chrome().gridlines, true);
    assert.equal(chrome().showHidden, false, "hidden components are off by default");
    press("ctrl+shift+H");
    assert.equal(chrome().showHidden, true);
    press("ctrl+shift+H");
    assert.equal(chrome().showHidden, false);
  });

  it("the media manager panel mirrors onto mediaManagerOpen", () => {
    press("ctrl+shift+M");
    assert.equal(e.ui.mediaManagerOpen, true);
    press("ctrl+shift+M");
    assert.equal(e.ui.mediaManagerOpen, false);
  });

  it("panel keys that skip text editing pass through inside a field", () => {
    assert.equal(press("ctrl+shift+M", input()), false);
    assert.equal(press("ctrl+shift+L", input()), false);
    assert.equal(press("ctrl+shift+G", input()), false);
    assert.equal(chrome().panel, null);
  });

  it("mod+F toggles the sidebar search only while the pointer is over the sidebar", () => {
    assert.equal(press("ctrl+f"), false, "pointer elsewhere: the browser's find opens");
    const panel = document.createElement("aside");
    panel.id = "toolbar";
    document.body.appendChild(panel);
    act(() => void panel.dispatchEvent(new Event("pointerover", { bubbles: true })));
    assert.equal(press("ctrl+f"), true);
    assert.equal(chrome().sidebarSearch, true);
    act(() => void document.body.dispatchEvent(new Event("pointerover", { bubbles: true })));
    assert.equal(press("ctrl+f"), false, "pointer left the sidebar");
  });

  it("zoom presets are the 17 stops from 0.25 to 10", () => {
    assert.deepEqual([...ZOOM_PRESETS], [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 5, 7.5, 10]);
  });

  it("mod+= / mod+- step through the presets and mod+0 resets; the ends pass through", () => {
    assert.equal(chrome().zoom, 1);
    assert.equal(press("ctrl+="), true);
    assert.equal(chrome().zoom, 1.1);
    assert.equal(press("ctrl+shift++"), true, "mod++ is the same key");
    assert.equal(chrome().zoom, 1.25);
    for (let i = 0; i < 3; i++) press("ctrl+-");
    assert.equal(chrome().zoom, 0.9);
    press("ctrl+0");
    assert.equal(chrome().zoom, 1);
    for (let i = 0; i < 20; i++) press("ctrl+-");
    assert.equal(chrome().zoom, 0.25);
    assert.equal(press("ctrl+-"), false, "already at the smallest preset: the browser zooms");
  });

  it("zoom keys over the sidebar or top bar reach the browser instead of being swallowed", () => {
    const panel = document.createElement("aside");
    panel.id = "toolbar";
    document.body.appendChild(panel);
    act(() => void panel.dispatchEvent(new Event("pointerover", { bubbles: true })));
    assert.equal(press("ctrl+="), false);
    assert.equal(chrome().zoom, 1);
  });

  it("a zoom binding another extension contributes is reached by the one keymap (no competing handler)", () => {
    let zoomed = 0;
    const zoom = defineCommand({ id: "test.zoom", title: "Zoom", run: (ctx) => (ctx.dispatch && zoomed++, true) });
    const host = createTestEditor({ files: { "index.liquid": FIXTURE }, extensions: [htmlKit(), tailwindKit(), editorKit(), zoom, contributes({ keybindings: [{ command: "test.zoom", key: "mod+shift+9" }] })] });
    const off = attachKeymap(host, { platform: "other" });
    assert.equal(press("ctrl+shift+9"), true);
    assert.equal(zoomed, 1);
    off();
  });

  it("Tab / shift+Tab select the next / previous sibling and wrap", () => {
    e.select(e.get("h1"));
    assert.equal(press("Tab"), true);
    assert.equal(e.state.selection.handles[0], e.get("p"));
    press("Tab");
    assert.equal(e.state.selection.handles[0], e.get("h1"), "wraps to the first");
    press("shift+Tab");
    assert.equal(e.state.selection.handles[0], e.get("p"), "wraps back to the last");
    e.select([]);
    assert.equal(press("Tab"), false, "no selection: Tab keeps moving focus");
  });

  it("Backspace / Delete delete the selected node and select its parent; no confirmation, no text-editing", () => {
    e.select(e.get("p"));
    assert.equal(press("Backspace", input()), false, "a field keeps Backspace");
    assert.ok(e.text().includes("World"));
    assert.equal(press("Backspace"), true);
    assert.ok(!e.text().includes("World"));
    assert.equal(e.state.selection.handles[0], e.get("section"), "the parent is selected");
    e.select([]);
    assert.equal(press("Delete"), false, "nothing selected: not prevented");
  });

  it("Escape clears the selection when nothing is open, and keeps it while an overlay closes first", () => {
    let closed = 0;
    pushOverlay({ id: "x", dismiss: () => closed++ });
    assert.equal(press("Escape"), true);
    assert.equal(closed, 1);
    assert.equal(e.state.selection.handles.length, 1, "selection kept");
    assert.equal(press("Escape"), true);
    assert.equal(e.state.selection.handles.length, 0);
    assert.equal(press("Escape"), false, "nothing left to do: the key passes through");
  });

  it("Escape in a field closes the top overlay (a Modal with focus in an input)", () => {
    let closed = 0;
    pushOverlay({ id: "modal", dismiss: () => closed++ });
    assert.equal(press("Escape", input()), true);
    assert.equal(closed, 1);
  });

  it("Escape exits preview before closing an overlay or clearing the selection", () => {
    let closed = 0;
    pushOverlay({ id: "x", dismiss: () => closed++ });
    e.run("preview.toggle");
    assert.equal(chrome().preview, true);
    assert.equal(press("Escape"), true);
    assert.equal(chrome().preview, false);
    assert.equal(closed, 0, "the overlay stays");
    assert.equal(e.state.selection.handles.length, 1, "the selection is untouched, so it is still selected after preview");
    press("Escape");
    assert.equal(closed, 1);
  });

  it("native copy, paste and cut are never swallowed: nothing selected, or typing in a field", () => {
    e.select([]);
    for (const k of ["ctrl+c", "ctrl+v", "ctrl+x", "ctrl+d"]) assert.equal(press(k), false, `${k} with nothing selected`);
    e.select(e.get("h1"));
    for (const k of ["ctrl+c", "ctrl+v", "ctrl+x"]) {
      assert.equal(press(k, input()), false, `${k} in an input`);
      const area = document.createElement("textarea");
      document.body.appendChild(area);
      assert.equal(press(k, area), false, `${k} in a textarea`);
    }
  });

  it("mod+C copies the node and mod+V pastes it as the next sibling, selected; paste works right after copying with no reselect", () => {
    e.select(e.get("h1"));
    assert.equal(press("ctrl+c"), true);
    assert.equal(press("ctrl+v"), true, "the paste check sees the fresh copy");
    assert.equal(e.find("index.liquid", "h1").length, 2);
    assert.match(e.text(), /<h1 class="text-xl">Hello<\/h1>\s*<h1 class="text-xl">Hello<\/h1>/);
    assert.equal(e.state.selection.handles.length, 1);
    assert.equal(e.state.selection.handles[0], e.find("index.liquid", "h1")[1], "the pasted copy is selected");
  });

  it("mod+V is left to the media manager's own paste handling while it is open", () => {
    e.select(e.get("h1"));
    press("ctrl+c");
    press("ctrl+shift+M");
    assert.equal(press("ctrl+v"), false);
    assert.equal(e.find("index.liquid", "h1").length, 1);
  });

  it("mod+D duplicates the node after itself and selects the copy", () => {
    e.select(e.get("p"));
    assert.equal(press("ctrl+d"), true);
    assert.equal(e.find("index.liquid", "p").length, 2);
    assert.equal(e.state.selection.handles[0], e.find("index.liquid", "p")[1]);
  });

  it("the keymap does nothing while the editor is hidden (active=false)", () => {
    detach();
    detach = attachKeymap(e, { platform: "other", active: false });
    assert.equal(press("Delete"), false);
    assert.equal(press("ctrl+shift+M"), false);
    assert.ok(e.text().includes("<section"));
  });

  it("macOS: ⌘ is mod and Ctrl is not", () => {
    detach();
    detach = attachKeymap(e, { platform: "mac" });
    assert.equal(press("ctrl+shift+M"), false);
    assert.equal(press("meta+shift+M"), true);
    assert.equal(chrome().panel, "media");
  });

  it("text surfaces: inputs, textareas, selects, contentEditable, ProseMirror, CodeMirror; not checkboxes", () => {
    const make = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.appendChild(host);
      return host.firstElementChild!;
    };
    assert.ok(isTextSurface(make("<input>")));
    assert.ok(isTextSurface(make("<textarea></textarea>")));
    assert.ok(isTextSurface(make("<select></select>")));
    assert.ok(isTextSurface(make('<div contenteditable="true"></div>')));
    assert.ok(isTextSurface(make('<div class="ProseMirror"><p>x</p></div>').firstElementChild));
    assert.ok(isTextSurface(make('<div class="cm-editor"><div class="cm-content"></div></div>').firstElementChild));
    assert.ok(!isTextSurface(make('<input type="checkbox">')));
    assert.ok(!isTextSurface(make("<button></button>")));
    assert.ok(!isTextSurface(null));
  });

  it("shortcuts read ⌘⇧⌥ on macOS and Ctrl+Shift+ elsewhere", () => {
    assert.equal(formatShortcut("mod+shift+z", "mac"), "⇧⌘Z");
    assert.equal(formatShortcut("mod+alt+k", "mac"), "⌥⌘K");
    assert.equal(formatShortcut("mod+shift+z", "other"), "Ctrl+Shift+Z");
    assert.equal(formatShortcut("alt+up", "other"), "Alt+↑");
    assert.equal(formatShortcut("escape", "other"), "Esc");
  });
});

describe("<Editor> mounts the keymap", () => {
  it("keys work inside <Editor> and stop on unmount; platform and active are props", () => {
    detach();
    const r = render(<Editor editor={e} platform="other" />);
    assert.equal(press("ctrl+shift+G"), true);
    assert.equal(chrome().gridlines, true);
    r.rerender(<Editor editor={e} platform="other" active={false} />);
    assert.equal(press("ctrl+shift+G"), false);
    r.unmount();
    assert.equal(press("ctrl+shift+G"), false);
  });
});
